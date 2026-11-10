import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, open, readFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import voiceCatalog from './speech-voices.json'
import type { InstallVoiceResult, SpeechVoice } from '@shared/types/speech'

interface CatalogVoice extends Omit<SpeechVoice, 'installed' | 'size'> {
  files: Record<string, { size_bytes: number; md5_digest: string }>
}
const catalog = voiceCatalog as unknown as CatalogVoice[]
const byId = new Map(catalog.map((voice) => [voice.id, voice]))
const VOICE_BASE =
  'https://huggingface.co/rhasspy/piper-voices/resolve/cf910fb59f1d79ab3b625a63993a108751c6c25d'

export const speechVoiceLicense = async(
  id: string,
  directories: string[] = []
): Promise<string | null> => {
  const voice = byId.get(id)
  const entry = voice && Object.entries(voice.files).find(([name]) => name.endsWith('/MODEL_CARD'))
  if (!entry) return null
  try {
    const [name, info] = entry
    const model = findSpeechModel(directories, id)
    if (model) {
      try {
        const data = await readFile(path.join(path.dirname(model), 'MODEL_CARD'))
        if (
          data.length === info.size_bytes &&
          createHash('md5').update(data).digest('hex') === info.md5_digest
        )
          return data.toString('utf8')
      } catch {
        /* An incomplete installation can still show the upstream model card. */
      }
    }
    if (info.size_bytes > 128 * 1024) return null
    const response = await fetch(`${VOICE_BASE}/${name}`, { signal: AbortSignal.timeout(20_000) })
    if (!response.ok) return null
    const data = Buffer.from(await response.arrayBuffer())
    if (
      data.length !== info.size_bytes ||
      createHash('md5').update(data).digest('hex') !== info.md5_digest
    )
      return null
    return data.toString('utf8')
  } catch {
    return null
  }
}

export const knownSpeechVoice = (id: string): boolean => byId.has(id)

export const findSpeechModel = (directories: string[], id: string): string | undefined => {
  if (!byId.has(id)) return undefined
  for (const directory of directories) {
    for (const model of [
      path.join(directory, 'voices', id, `${id}.onnx`),
      path.join(directory, `${id}.onnx`)
    ]) {
      if (existsSync(model) && existsSync(`${model}.json`)) return model
    }
  }
  return undefined
}

export const listSpeechVoices = (directories: string[]): SpeechVoice[] =>
  catalog.map((voice) => ({
    id: voice.id,
    name: voice.name,
    language: voice.language,
    languageName: voice.languageName,
    country: voice.country,
    quality: voice.quality,
    speakers: voice.speakers,
    size: Object.values(voice.files).reduce((total, file) => total + file.size_bytes, 0),
    installed: !!findSpeechModel(directories, voice.id)
  }))

/** Downloads only catalogued files, checking upstream sizes and digests before publication. */
export class SpeechVoiceDownloads {
  private readonly active = new Map<string, Promise<InstallVoiceResult>>()
  private readonly controller = new AbortController()

  constructor(private readonly directory: string) {}

  cancelAll(): void {
    this.controller.abort()
  }

  install(id: string): Promise<InstallVoiceResult> {
    const voice = byId.get(id)
    if (!voice) return Promise.resolve({ ok: false, error: 'unknown' })
    const existing = this.active.get(id)
    if (existing) return existing
    const result = this.download(voice).finally(() => {
      this.active.delete(id)
    })
    this.active.set(id, result)
    return result
  }

  private async download(voice: CatalogVoice): Promise<InstallVoiceResult> {
    const destination = path.join(this.directory, 'voices')
    let temporary: string | undefined
    try {
      if (findSpeechModel([this.directory], voice.id)) return { ok: true }
      await mkdir(destination, { recursive: true })
      temporary = await mkdtemp(path.join(destination, '.download-'))
      for (const [filePath, info] of Object.entries(voice.files)) {
        const response = await fetch(`${VOICE_BASE}/${filePath}`, {
          signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(180_000)])
        })
        if (!response.ok || !response.body) throw new Error('Voice download failed')
        const file = await open(path.join(temporary, path.posix.basename(filePath)), 'w')
        const hash = createHash('md5')
        let size = 0
        try {
          for await (const chunk of response.body) {
            size += chunk.byteLength
            if (size > info.size_bytes) throw new Error('Voice file too large')
            hash.update(chunk)
            await file.writeFile(chunk)
          }
        } finally {
          await file.close()
        }
        if (size !== info.size_bytes || hash.digest('hex') !== info.md5_digest)
          throw new Error('Voice checksum mismatch')
      }
      await rename(temporary, path.join(destination, voice.id))
      temporary = undefined
      return { ok: true }
    } catch {
      return { ok: false, error: 'download' }
    } finally {
      if (temporary) await rm(temporary, { recursive: true, force: true })
    }
  }
}
