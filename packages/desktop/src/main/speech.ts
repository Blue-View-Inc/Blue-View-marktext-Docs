import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_SPEECH_SETTINGS,
  MAX_SPEECH_TEXT_LENGTH,
  validSpeechSettings,
  type SpeechAudioResult,
  type SpeechVoiceSettings
} from '@shared/types/speech'
import { knownSpeechVoice } from './speechVoices'

interface Synthesis {
  finish(result: SpeechAudioResult): void
}

interface SpeechWorker {
  child: ChildProcessWithoutNullStreams
  key: string
  sampleRate: number
  pending?: Synthesis
  buffer: Buffer
  idle?: ReturnType<typeof setTimeout>
}

const MAX_AUDIO_BYTES = 8 * 1024 * 1024

/** Owns one cancellable synthesis per window; document text travels only through stdin. */
export class SpeechSynthesizer {
  private readonly active = new Map<number, Synthesis>()
  private readonly workers = new Map<number, SpeechWorker>()

  constructor(private readonly directories: string[]) {}

  cancel(owner: number): void {
    const worker = this.workers.get(owner)
    if (worker) this.retire(owner, worker, { status: 'canceled' })
    this.active.get(owner)?.finish({ status: 'canceled' })
  }

  cancelAll(): void {
    for (const owner of new Set([...this.active.keys(), ...this.workers.keys()])) this.cancel(owner)
  }

  async synthesize(
    owner: number,
    text: string,
    voice = DEFAULT_SPEECH_SETTINGS
  ): Promise<SpeechAudioResult> {
    if (
      typeof text !== 'string' ||
      !text.trim() ||
      text.length > MAX_SPEECH_TEXT_LENGTH ||
      !validSpeechSettings(voice) ||
      !knownSpeechVoice(voice.voiceId)
    ) {
      return { status: 'error', reason: 'invalid' }
    }
    if (this.active.has(owner)) this.cancel(owner)

    return new Promise((resolve) => {
      const synthesis: Synthesis = {
        finish: (result) => {
          if (this.active.get(owner) !== synthesis) return
          clearTimeout(timer)
          this.active.delete(owner)
          resolve(result)
        }
      }
      this.active.set(owner, synthesis)
      const timer = setTimeout(() => {
        const worker = this.workers.get(owner)
        if (worker?.pending === synthesis) this.retire(owner, worker)
        synthesis.finish({ status: 'error', reason: 'failed' })
      }, 60_000)

      void this.run(owner, text, synthesis, voice).catch(() => {
        const worker = this.workers.get(owner)
        if (worker?.pending === synthesis) this.retire(owner, worker)
        synthesis.finish({ status: 'error', reason: 'failed' })
      })
    })
  }

  private async run(
    owner: number,
    text: string,
    synthesis: Synthesis,
    voice: SpeechVoiceSettings
  ): Promise<void> {
    let engine:
      { executable: string; model: string; sampleRate: number; prefix: string[] } | undefined
    for (const directory of this.directories) {
      const executable = path.join(directory, 'python', 'bin', 'python3')
      try {
        const worker = path.join(directory, 'speech-worker.py')
        await access(executable, constants.X_OK)
        await access(worker, constants.R_OK)
        const prefix = [
          '-I',
          worker,
          '--packages',
          path.join(directory, 'python-packages'),
          '--cache-dir',
          path.join(this.directories[0], 'language-data')
        ]
        let model = ''
        for (const modelDirectory of this.directories) {
          for (const candidate of [
            path.join(modelDirectory, 'voices', voice.voiceId, `${voice.voiceId}.onnx`),
            path.join(modelDirectory, `${voice.voiceId}.onnx`)
          ]) {
            try {
              await access(candidate, constants.R_OK)
              await access(`${candidate}.json`, constants.R_OK)
              model = candidate
              break
            } catch {
              continue
            }
          }
          if (model) break
        }
        if (!model) continue
        const config = JSON.parse(await readFile(`${model}.json`, 'utf8'))
        const sampleRate: unknown = config.audio?.sample_rate
        if (
          typeof sampleRate !== 'number' ||
          !Number.isInteger(sampleRate) ||
          sampleRate < 8000 ||
          sampleRate > 48000
        )
          continue
        if (voice.speaker >= (config.num_speakers ?? 1)) {
          synthesis.finish({ status: 'error', reason: 'invalid' })
          return
        }
        engine = { executable, model, sampleRate, prefix }
        break
      } catch {
        continue
      }
    }
    if (this.active.get(owner) !== synthesis) return
    if (!engine) {
      synthesis.finish({ status: 'error', reason: 'unavailable' })
      return
    }

    const args = [
      ...engine.prefix,
      '--model',
      engine.model,
      '--server',
      '--length_scale',
      String({ relaxed: 1.1, neutral: 1, expressive: 0.95 }[voice.style]),
      '--noise_scale',
      String(0.3 + voice.expression * 0.5),
      '--noise_w',
      String(0.45 + voice.expression * 0.4),
      '--sentence_silence',
      String(voice.sentencePause),
      '--speaker',
      String(voice.speaker)
    ]
    const key = JSON.stringify([engine.executable, args])
    let worker = this.workers.get(owner)
    if (worker && worker.key !== key) {
      this.retire(owner, worker)
      worker = undefined
    }
    if (!worker) {
      const child = spawn(engine.executable, args, {
        stdio: 'pipe',
        windowsHide: true
      })
      worker = { child, key, sampleRate: engine.sampleRate, buffer: Buffer.alloc(0) }
      const session = worker
      this.workers.set(owner, session)
      child.stdout.on('data', (chunk: Buffer) => this.receive(owner, session, chunk))
      child.stderr.resume()
      child.on('error', () => this.retire(owner, session))
      child.stdin.on('error', () => this.retire(owner, session))
      child.on('close', () => this.retire(owner, session))
    }
    clearTimeout(worker.idle)
    worker.pending = synthesis
    worker.child.stdin.write(JSON.stringify({ text: text.replace(/\s*\n\s*/g, ' ') }) + '\n')
  }

  private retire(
    owner: number,
    worker: SpeechWorker,
    result: SpeechAudioResult = { status: 'error', reason: 'failed' }
  ): void {
    if (this.workers.get(owner) !== worker) return
    this.workers.delete(owner)
    clearTimeout(worker.idle)
    worker.child.kill()
    worker.pending?.finish(result)
    worker.pending = undefined
    worker.buffer = Buffer.alloc(0)
  }

  private receive(owner: number, worker: SpeechWorker, chunk: Buffer): void {
    if (this.workers.get(owner) !== worker) return
    if (!worker.pending || worker.buffer.length + chunk.length > MAX_AUDIO_BYTES + 4) {
      this.retire(owner, worker)
      return
    }
    worker.buffer = Buffer.concat([worker.buffer, chunk])
    if (worker.buffer.length < 4) return
    // Each request produces one little-endian byte count followed by mono int16 PCM.
    const size = worker.buffer.readUInt32LE(0)
    if (!size || size > MAX_AUDIO_BYTES || size % 2 || worker.buffer.length > size + 4) {
      this.retire(owner, worker)
      return
    }
    if (worker.buffer.length === size + 4) {
      const pcm = worker.buffer.subarray(4)
      const sampleRate = worker.sampleRate
      const header = Buffer.alloc(44)
      header.write('RIFF', 0)
      header.writeUInt32LE(36 + pcm.length, 4)
      header.write('WAVEfmt ', 8)
      header.writeUInt32LE(16, 16)
      header.writeUInt16LE(1, 20)
      header.writeUInt16LE(1, 22)
      header.writeUInt32LE(sampleRate, 24)
      header.writeUInt32LE(sampleRate * 2, 28)
      header.writeUInt16LE(2, 32)
      header.writeUInt16LE(16, 34)
      header.write('data', 36)
      header.writeUInt32LE(pcm.length, 40)
      const pending = worker.pending
      worker.pending = undefined
      worker.buffer = Buffer.alloc(0)
      worker.idle = setTimeout(() => this.retire(owner, worker), 60_000)
      pending.finish({ status: 'ready', audio: new Uint8Array(Buffer.concat([header, pcm])) })
    }
  }
}
