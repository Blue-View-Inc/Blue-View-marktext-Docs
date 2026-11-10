import { spawn, type ChildProcess } from 'node:child_process'
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
  child?: ChildProcess
  finish(result: SpeechAudioResult): void
}

const MAX_AUDIO_BYTES = 8 * 1024 * 1024

/** Owns one cancellable synthesis per window; document text travels only through stdin. */
export class SpeechSynthesizer {
  private readonly active = new Map<number, Synthesis>()

  constructor(private readonly directories: string[]) {}

  cancel(owner: number): void {
    const synthesis = this.active.get(owner)
    if (!synthesis) return
    synthesis.child?.kill()
    synthesis.finish({ status: 'canceled' })
  }

  cancelAll(): void {
    for (const owner of this.active.keys()) this.cancel(owner)
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
    this.cancel(owner)

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
        synthesis.child?.kill()
        synthesis.finish({ status: 'error', reason: 'failed' })
      }, 60_000)

      void this.run(owner, text, synthesis, voice).catch(() => {
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

    const child = spawn(
      engine.executable,
      [
        ...engine.prefix,
        '--model',
        engine.model,
        '--output_raw',
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
      ],
      { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true }
    )
    synthesis.child = child
    const chunks: Buffer[] = []
    let size = 0
    const sampleRate = engine.sampleRate
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_AUDIO_BYTES) {
        child.kill()
        synthesis.finish({ status: 'error', reason: 'failed' })
        return
      }
      chunks.push(chunk)
    })
    child.on('error', () => synthesis.finish({ status: 'error', reason: 'failed' }))
    child.stdin.on('error', () => {
      child.kill()
      synthesis.finish({ status: 'error', reason: 'failed' })
    })
    child.on('close', (code) => {
      if (code !== 0 || size === 0 || size % 2 !== 0) {
        synthesis.finish({ status: 'error', reason: 'failed' })
        return
      }
      const pcm = Buffer.concat(chunks)
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
      synthesis.finish({ status: 'ready', audio: new Uint8Array(Buffer.concat([header, pcm])) })
    })
    child.stdin.end(text.replace(/\s*\n\s*/g, ' ') + '\n')
  }
}
