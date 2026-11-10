import { describe, expect, it, vi } from 'vitest'
import { ReadAloudPlayer, type ReadingAudio, type SpeechTransport } from '@/services/readAloud'
import type { SpeechAudioResult } from '@shared/types/speech'
import { readingSentences } from '@/util/readingText'

const ready = (): SpeechAudioResult => ({ status: 'ready', audio: new Uint8Array([1, 2]) })
const tick = async() => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}
const setup = () => {
  let end = () => {}
  const audio: ReadingAudio = {
    start: vi.fn(async(_bytes, _rate, ended) => {
      end = ended
    }),
    pause: vi.fn(),
    resume: vi.fn(async() => {}),
    stop: vi.fn(),
    setRate: vi.fn()
  }
  const speech: SpeechTransport = {
    synthesize: vi.fn(async() => ready()),
    cancel: vi.fn(async() => {})
  }
  const player = new ReadAloudPlayer(speech, audio, vi.fn())
  return { player, audio, speech, ended: () => end() }
}
const sentences = [
  { text: 'First sentence.', paragraph: 0 },
  { text: 'Second sentence.', paragraph: 0 },
  { text: 'Another paragraph.', paragraph: 1 },
  { text: 'The last paragraph.', paragraph: 2 }
]

describe('Read Aloud playback', () => {
  it('retries the failed sentence without restarting the document', async() => {
    const { player, speech, ended } = setup()
    let failSecond = true
    vi.mocked(speech.synthesize).mockImplementation(async(text) => {
      if (text === sentences[1].text && failSecond) return { status: 'error', reason: 'failed' }
      return ready()
    })
    player.start(sentences.slice(0, 2))
    await tick()
    ended()
    await tick()
    expect(player.state.status).toBe('error')
    expect(player.state.index).toBe(1)
    failSecond = false
    player.play()
    await tick()
    expect(player.state.status).toBe('playing')
    expect(player.state.index).toBe(1)
  })
  it('pauses and resumes the same audio position without synthesizing again', async() => {
    const { player, audio, speech } = setup()
    player.start(sentences)
    await tick()
    const calls = vi.mocked(speech.synthesize).mock.calls.length
    player.pause()
    expect(player.state.status).toBe('paused')
    player.play()
    await tick()
    expect(audio.pause).toHaveBeenCalled()
    expect(audio.resume).toHaveBeenCalledOnce()
    expect(speech.synthesize).toHaveBeenCalledTimes(calls)
  })

  it('does not start audio when a paused synthesis completes', async() => {
    const { player, audio, speech } = setup()
    let finish: (value: SpeechAudioResult) => void = () => {}
    vi.mocked(speech.synthesize).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    player.start(sentences)
    player.pause()
    finish(ready())
    await tick()
    expect(audio.start).not.toHaveBeenCalled()
    player.play()
    await tick()
    expect(audio.start).toHaveBeenCalledOnce()
  })

  it('discards a late result after Stop', async() => {
    const { player, audio, speech } = setup()
    let finish: (value: SpeechAudioResult) => void = () => {}
    vi.mocked(speech.synthesize).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    player.start(sentences)
    player.stop()
    finish(ready())
    await tick()
    expect(audio.start).not.toHaveBeenCalled()
    expect(player.state.status).toBe('stopped')
  })

  it('skips and rewinds sentences and paragraphs while preserving paused state', async() => {
    const { player } = setup()
    player.start(sentences)
    await tick()
    player.sentence(1)
    await tick()
    expect(player.state.index).toBe(1)
    player.paragraph(1)
    await tick()
    expect(player.state.index).toBe(2)
    player.pause()
    player.paragraph(-1)
    expect(player.state.index).toBe(0)
    expect(player.state.status).toBe('paused')
    player.sentence(1)
    player.sentence(-1)
    expect(player.state.index).toBe(0)
  })

  it('prefetches the next sentence and finishes at the end', async() => {
    const { player, speech, ended } = setup()
    player.start(sentences.slice(0, 2))
    await tick()
    expect(speech.synthesize).toHaveBeenCalledTimes(2)
    ended()
    await tick()
    expect(player.state.index).toBe(1)
    expect(speech.synthesize).toHaveBeenCalledTimes(2)
    ended()
    expect(player.state.status).toBe('finished')
    player.play()
    await tick()
    expect(player.state.index).toBe(0)
  })

  it('adjusts speed immediately without restarting the sentence', async() => {
    const { player, audio } = setup()
    player.start(sentences)
    await tick()
    player.setRate(1.5)
    expect(audio.setRate).toHaveBeenCalledWith(1.5)
    expect(audio.start).toHaveBeenCalledOnce()
    player.setRate(100)
    expect(player.state.rate).toBe(2)
  })

  it('reports missing voices and rejected synthesis without an unhandled promise', async() => {
    const { player, speech } = setup()
    vi.mocked(speech.synthesize).mockResolvedValueOnce({ status: 'error', reason: 'unavailable' })
    player.start(sentences)
    await tick()
    expect(player.state.error).toBe('unavailable')
    vi.mocked(speech.synthesize).mockRejectedValueOnce(new Error('IPC failed'))
    player.play()
    await tick()
    expect(player.state.status).toBe('error')
  })
})

describe('readable Markdown', () => {
  it('retains sentences and paragraph boundaries without speaking formatting or link URLs', () => {
    const result = readingSentences(
      '# Heading\n\nHello **world**. Another sentence!\n\nRead [this link](https://example.com).'
    )
    expect(result.map((sentence) => sentence.text)).toEqual([
      'Heading',
      'Hello world.',
      'Another sentence!',
      'Read this link.'
    ])
    expect(result.map((sentence) => sentence.paragraph)).toEqual([0, 1, 1, 2])
  })

  it('skips scripts, code, front matter and reference sections', () => {
    const result = readingSentences(
      '---\ntitle: hidden\n---\n\nProse.\n\n```js\nsecret()\n```\n\n<script>alert(1)</script>\n\n## References\n\nA citation.'
    )
    expect(result.map((sentence) => sentence.text)).toEqual(['Prose.'])
  })

  it('can keep references when requested', () => {
    const result = readingSentences('Prose.\n\n## References\n\nA citation.', false)
    expect(result.map((sentence) => sentence.text)).toContain('A citation.')
  })

  it('bounds very long sentences without dropping words', () => {
    const text = 'word '.repeat(500).trim()
    const result = readingSentences(text)
    expect(result.every((sentence) => sentence.text.length <= 500)).toBe(true)
    expect(result.map((sentence) => sentence.text).join(' ')).toBe(text)
  })
})
