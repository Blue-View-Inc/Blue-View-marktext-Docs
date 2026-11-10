// @vitest-environment node
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  listSpeechVoices,
  SpeechVoiceDownloads,
  speechVoiceLicense
} from 'main_renderer/speechVoices'
import {
  DEFAULT_SPEECH_SETTINGS,
  recommendedSpeechVoices,
  validSpeechSettings
} from '@shared/types/speech'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('voice catalog', () => {
  it('exposes the pinned languages and at most five distinct recommendations per language', () => {
    const voices = listSpeechVoices([])
    expect(voices).toHaveLength(180)
    const languages = [...new Set(voices.map((voice) => voice.language.split('_')[0]))]
    expect(languages).toHaveLength(53)
    for (const language of languages) {
      const choices = recommendedSpeechVoices(
        voices.filter((voice) => voice.language.split('_')[0] === language)
      )
      expect(choices.length).toBeGreaterThan(0)
      expect(choices.length).toBeLessThanOrEqual(5)
      expect(new Set(choices.map((voice) => `${voice.language}:${voice.name}`)).size).toBe(
        choices.length
      )
    }
  })

  it('rejects path-like and unknown voice requests before network access', async() => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const downloads = new SpeechVoiceDownloads('/no/voice/files')
    expect(await downloads.install('../../elsewhere')).toEqual({ ok: false, error: 'unknown' })
    expect(await speechVoiceLicense('unknown')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('removes incomplete downloads after a size or checksum mismatch', async() => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'marktext-voice-test-'))
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn(async() => new Response(new Uint8Array([1, 2])))
      )
      const downloads = new SpeechVoiceDownloads(directory)
      expect(await downloads.install('en_US-lessac-medium')).toEqual({
        ok: false,
        error: 'download'
      })
      expect(await readdir(path.join(directory, 'voices'))).toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('bounds calibration values and voice identifiers', () => {
    expect(validSpeechSettings(DEFAULT_SPEECH_SETTINGS)).toBe(true)
    expect(validSpeechSettings({ ...DEFAULT_SPEECH_SETTINGS, voiceId: '../model' })).toBe(false)
    expect(validSpeechSettings({ ...DEFAULT_SPEECH_SETTINGS, expression: Number.NaN })).toBe(false)
    expect(validSpeechSettings({ ...DEFAULT_SPEECH_SETTINGS, paragraphPause: -1 })).toBe(false)
    expect(validSpeechSettings({ ...DEFAULT_SPEECH_SETTINGS, rate: 100 })).toBe(false)
  })
})
