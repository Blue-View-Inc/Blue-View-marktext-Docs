import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SPEECH_SETTINGS } from '@shared/types/speech'
import { loadSpeechCalibration, saveSpeechCalibration } from '@/util/speechPreferences'

beforeEach(() => {
  localStorage.clear()
})

describe('voice calibration preferences', () => {
  it('remembers different settings for each voice and speaker', () => {
    const english = { ...DEFAULT_SPEECH_SETTINGS, rate: 0.9, expression: 0.25 }
    const spanish = { ...DEFAULT_SPEECH_SETTINGS, voiceId: 'es_ES-davefx-medium', rate: 1.1 }
    saveSpeechCalibration(english)
    saveSpeechCalibration(spanish)
    expect(loadSpeechCalibration()).toEqual(spanish)
    expect(loadSpeechCalibration(english.voiceId)).toEqual(english)
    expect(loadSpeechCalibration(spanish.voiceId)).toEqual(spanish)
    expect(loadSpeechCalibration(spanish.voiceId, 1).speaker).toBe(1)
  })

  it('falls back safely when stored preferences are malformed', () => {
    localStorage.setItem('marktext.readAloud.current', '{broken')
    expect(loadSpeechCalibration()).toEqual(DEFAULT_SPEECH_SETTINGS)
  })
})
