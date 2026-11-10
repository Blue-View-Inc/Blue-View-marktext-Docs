import {
  DEFAULT_SPEECH_SETTINGS,
  validSpeechSettings,
  type SpeechVoiceSettings
} from '@shared/types/speech'

const key = (id: string, speaker: number): string => `marktext.readAloud.voice.${id}.${speaker}`

export const loadSpeechCalibration = (id?: string, speaker = 0): SpeechVoiceSettings => {
  try {
    if (!id) {
      const current: unknown = JSON.parse(
        localStorage.getItem('marktext.readAloud.current') ?? 'null'
      )
      if (validSpeechSettings(current)) return { ...current }
    } else {
      const stored: unknown = JSON.parse(localStorage.getItem(key(id, speaker)) ?? 'null')
      if (validSpeechSettings(stored) && stored.voiceId === id && stored.speaker === speaker)
        return { ...stored }
    }
  } catch {
    /* A read-only profile still supports session-only calibration. */
  }
  return { ...DEFAULT_SPEECH_SETTINGS, ...(id ? { voiceId: id, speaker } : {}) }
}

export const saveSpeechCalibration = (voice: SpeechVoiceSettings): void => {
  if (!validSpeechSettings(voice)) return
  try {
    const json = JSON.stringify(voice)
    localStorage.setItem(key(voice.voiceId, voice.speaker), json)
    localStorage.setItem('marktext.readAloud.current', json)
  } catch {
    /* A read-only profile still supports session-only calibration. */
  }
}
