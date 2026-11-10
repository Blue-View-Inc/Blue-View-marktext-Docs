export type SpeechAudioResult =
  | { status: 'ready'; audio: Uint8Array }
  | { status: 'canceled' }
  | { status: 'error'; reason: 'unavailable' | 'failed' | 'invalid' }

export const MAX_SPEECH_TEXT_LENGTH = 1200

export interface SpeechVoiceSettings {
  voiceId: string
  speaker: number
  style: 'relaxed' | 'neutral' | 'expressive'
  expression: number
  sentencePause: number
  paragraphPause: number
  rate: number
}

export const SPEECH_DELIVERY_PRESETS = {
  relaxed: { expression: 0.3, sentencePause: 0.15, paragraphPause: 0.4 },
  neutral: { expression: 0.5, sentencePause: 0.1, paragraphPause: 0.3 },
  expressive: { expression: 0.8, sentencePause: 0.1, paragraphPause: 0.25 }
}

export const DEFAULT_SPEECH_SETTINGS: SpeechVoiceSettings = {
  voiceId: 'en_US-lessac-medium',
  speaker: 0,
  style: 'relaxed',
  ...SPEECH_DELIVERY_PRESETS.relaxed,
  rate: 1
}

export const validSpeechSettings = (value: unknown): value is SpeechVoiceSettings => {
  if (!value || typeof value !== 'object') return false
  const settings = value as SpeechVoiceSettings
  return (
    typeof settings.voiceId === 'string' &&
    /^[a-zA-Z0-9_-]+$/.test(settings.voiceId) &&
    Number.isInteger(settings.speaker) &&
    settings.speaker >= 0 &&
    settings.speaker < 1000 &&
    ['relaxed', 'neutral', 'expressive'].includes(settings.style) &&
    Number.isFinite(settings.expression) &&
    settings.expression >= 0 &&
    settings.expression <= 1 &&
    Number.isFinite(settings.sentencePause) &&
    settings.sentencePause >= 0 &&
    settings.sentencePause <= 1 &&
    Number.isFinite(settings.paragraphPause) &&
    settings.paragraphPause >= 0 &&
    settings.paragraphPause <= 2 &&
    Number.isFinite(settings.rate) &&
    settings.rate >= 0.5 &&
    settings.rate <= 2
  )
}

export interface SpeechVoice {
  id: string
  name: string
  language: string
  languageName: string
  country: string
  quality: string
  speakers: Record<string, number>
  size: number
  installed: boolean
}

export type InstallVoiceResult = { ok: true } | { ok: false; error: 'download' | 'unknown' }

/** Quality tiers are upstream ratings, not listening-test results; prefer distinct speakers. */
export const recommendedSpeechVoices = (voices: SpeechVoice[]): SpeechVoice[] => {
  const quality: Record<string, number> = { high: 3, medium: 2, low: 1, x_low: 0 }
  const sorted = [...voices].sort(
    (a, b) =>
      (quality[b.quality] ?? -1) - (quality[a.quality] ?? -1) || a.name.localeCompare(b.name)
  )
  const names = new Set<string>()
  const recommendations: SpeechVoice[] = []
  for (const voice of sorted) {
    const identity = `${voice.language}:${voice.name}`
    if (names.has(identity)) continue
    names.add(identity)
    recommendations.push(voice)
    if (recommendations.length === 5) break
  }
  return recommendations
}
