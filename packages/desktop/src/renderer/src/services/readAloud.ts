import {
  DEFAULT_SPEECH_SETTINGS,
  validSpeechSettings,
  type SpeechAudioResult,
  type SpeechVoiceSettings
} from '@shared/types/speech'

export interface ReadingSentence {
  text: string
  paragraph: number
}

export interface ReadingState {
  status: 'stopped' | 'loading' | 'playing' | 'paused' | 'finished' | 'error'
  index: number
  rate: number
  error: 'unavailable' | 'failed' | 'invalid' | null
}

export interface SpeechTransport {
  synthesize(text: string, voice?: SpeechVoiceSettings): Promise<SpeechAudioResult>
  cancel(): Promise<void>
}

export interface ReadingAudio {
  start(bytes: Uint8Array, rate: number, ended: () => void, failed: () => void): Promise<void>
  resume(): Promise<void>
  pause(): void
  stop(): void
  setRate(rate: number): void
}

export const createReadingAudio = (): ReadingAudio => {
  const audio = new Audio()
  audio.preservesPitch = true
  let url: string | null = null
  const stop = (): void => {
    audio.pause()
    audio.onended = null
    audio.onerror = null
    audio.removeAttribute('src')
    audio.load()
    if (url) URL.revokeObjectURL(url)
    url = null
  }
  return {
    async start(bytes, rate, ended, failed) {
      stop()
      url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'audio/wav' }))
      audio.src = url
      audio.playbackRate = rate
      const playingUrl = url
      audio.onended = () => {
        if (url === playingUrl) ended()
      }
      audio.onerror = () => {
        if (url === playingUrl) failed()
      }
      await audio.play()
    },
    resume: () => audio.play(),
    pause: () => audio.pause(),
    stop,
    setRate: (rate) => {
      audio.playbackRate = rate
    }
  }
}

/** Reads a document snapshot; a generation prevents canceled work from resuming playback. */
export class ReadAloudPlayer {
  readonly state: ReadingState = { status: 'stopped', index: 0, rate: 1, error: null }
  sentences: ReadingSentence[] = []
  voice: SpeechVoiceSettings = { ...DEFAULT_SPEECH_SETTINGS }
  private generation = 0
  private loaded = false
  private gapTimer: ReturnType<typeof setTimeout> | undefined
  private readonly cache = new Map<number, Promise<SpeechAudioResult>>()

  constructor(
    private readonly speech: SpeechTransport,
    private readonly audio: ReadingAudio,
    private readonly changed: (state: ReadingState) => void
  ) {}

  start(sentences: ReadingSentence[]): void {
    this.stop()
    this.sentences = sentences
    if (sentences.length) this.play()
  }

  play(): void {
    if (!this.sentences.length) return
    if (this.state.status === 'finished') this.state.index = 0
    this.state.error = null
    const generation = ++this.generation
    if (this.loaded) {
      this.update('playing')
      void this.audio.resume().catch(() => this.fail(generation, 'failed'))
    } else {
      this.update('loading')
      void this.playCurrent(generation)
    }
  }

  pause(): void {
    clearTimeout(this.gapTimer)
    ++this.generation
    this.audio.pause()
    this.update('paused')
  }

  stop(): void {
    clearTimeout(this.gapTimer)
    ++this.generation
    this.audio.stop()
    this.loaded = false
    this.cache.clear()
    void this.speech.cancel().catch(() => {})
    this.state.index = 0
    this.state.error = null
    this.update('stopped')
  }

  sentence(delta: number): void {
    this.seek(this.state.index + delta)
  }

  paragraph(delta: number): void {
    const paragraph = this.sentences[this.state.index]?.paragraph
    if (paragraph === undefined) return
    const target = Math.max(0, paragraph + delta)
    const index = this.sentences.findIndex((sentence) => sentence.paragraph >= target)
    if (index >= 0) this.seek(index)
  }

  setRate(rate: number): void {
    if (!Number.isFinite(rate)) return
    this.state.rate = Math.max(0.5, Math.min(2, rate))
    this.voice.rate = this.state.rate
    this.audio.setRate(this.state.rate)
    this.changed({ ...this.state })
  }

  private seek(index: number): void {
    if (!this.sentences.length) return
    const resume = this.state.status === 'playing' || this.state.status === 'loading'
    this.stop()
    this.state.index = Math.max(0, Math.min(this.sentences.length - 1, index))
    this.update('paused')
    if (resume) this.play()
  }

  setVoice(voice: SpeechVoiceSettings): void {
    if (!validSpeechSettings(voice)) return
    const index = this.state.index
    const status = this.state.status
    this.stop()
    this.voice = { ...voice }
    this.setRate(voice.rate)
    this.state.index = index
    if (status === 'playing' || status === 'loading') this.play()
    else if (status === 'paused') this.update('paused')
  }

  private prepare(index: number): Promise<SpeechAudioResult> {
    let result = this.cache.get(index)
    if (!result) {
      result = this.speech
        .synthesize(this.sentences[index].text, { ...this.voice })
        .catch((): SpeechAudioResult => ({ status: 'error', reason: 'failed' }))
      this.cache.set(index, result)
    }
    return result
  }

  private async playCurrent(generation: number): Promise<void> {
    const index = this.state.index
    const result = await this.prepare(index)
    if (generation !== this.generation) return
    if (result.status !== 'ready') {
      this.fail(generation, result.status === 'error' ? result.reason : 'failed')
      return
    }
    this.loaded = true
    this.update('playing')
    try {
      await this.audio.start(
        result.audio,
        this.state.rate,
        () => this.advance(),
        () => {
          this.fail(this.generation, 'failed')
        }
      )
    } catch {
      this.fail(generation, 'failed')
      return
    }
    if (generation !== this.generation) return
    // Keep only adjacent audio; long documents must not accumulate WAVs in memory.
    for (const key of this.cache.keys()) {
      if (key < index || key > index + 1) this.cache.delete(key)
    }
    if (index + 1 < this.sentences.length) void this.prepare(index + 1)
  }

  private advance(): void {
    if (this.state.status !== 'playing') return
    this.audio.stop()
    this.loaded = false
    if (this.state.index + 1 >= this.sentences.length) {
      this.update('finished')
      return
    }
    const previousParagraph = this.sentences[this.state.index].paragraph
    ++this.state.index
    if (previousParagraph !== this.sentences[this.state.index].paragraph) {
      this.update('loading')
      const pause = Math.max(0, this.voice.paragraphPause - this.voice.sentencePause)
      this.gapTimer = setTimeout(() => {
        this.play()
      }, pause * 1000)
    } else {
      this.play()
    }
  }

  private fail(generation: number, reason: ReadingState['error']): void {
    if (generation !== this.generation) return
    const index = this.state.index
    this.stop()
    this.state.index = index
    this.state.error = reason
    this.update('error')
  }

  private update(status: ReadingState['status']): void {
    this.state.status = status
    this.changed({ ...this.state })
  }
}
