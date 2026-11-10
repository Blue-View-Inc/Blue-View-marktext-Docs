import {
  DEFAULT_SPEECH_SETTINGS,
  SPEECH_DELIVERY_PRESETS,
  validSpeechSettings,
  type SpeechVoiceSettings
} from '@shared/types/speech'

const key = (id: string, speaker: number): string => `marktext.readAloud.voice.${id}.${speaker}`

const restoreCalibration = (stored: SpeechVoiceSettings): SpeechVoiceSettings => {
  const { timingVersion, ...voice } = stored as SpeechVoiceSettings & { timingVersion?: number }
  const legacy = { relaxed: [0.3, 0.7], neutral: [0.2, 0.5], expressive: [0.15, 0.35] }[voice.style]
  if (
    timingVersion !== 2 &&
    voice.sentencePause === legacy[0] &&
    voice.paragraphPause === legacy[1]
  ) {
    const preset = SPEECH_DELIVERY_PRESETS[voice.style]
    voice.sentencePause = preset.sentencePause
    voice.paragraphPause = preset.paragraphPause
  }
  return voice
}

export const loadSpeechCalibration = (id?: string, speaker = 0): SpeechVoiceSettings => {
  try {
    if (!id) {
      const current: unknown = JSON.parse(
        localStorage.getItem('marktext.readAloud.current') ?? 'null'
      )
      if (validSpeechSettings(current)) return restoreCalibration(current)
    } else {
      const stored: unknown = JSON.parse(localStorage.getItem(key(id, speaker)) ?? 'null')
      if (validSpeechSettings(stored) && stored.voiceId === id && stored.speaker === speaker)
        return restoreCalibration(stored)
    }
  } catch {
    /* A read-only profile still supports session-only calibration. */
  }
  return { ...DEFAULT_SPEECH_SETTINGS, ...(id ? { voiceId: id, speaker } : {}) }
}

export const saveSpeechCalibration = (voice: SpeechVoiceSettings): void => {
  if (!validSpeechSettings(voice)) return
  try {
    const json = JSON.stringify({ ...voice, timingVersion: 2 })
    localStorage.setItem(key(voice.voiceId, voice.speaker), json)
    localStorage.setItem('marktext.readAloud.current', json)
  } catch {
    /* A read-only profile still supports session-only calibration. */
  }
}
