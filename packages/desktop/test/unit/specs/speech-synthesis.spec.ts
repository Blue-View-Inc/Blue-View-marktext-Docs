// @vitest-environment node
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { spawn, access, readFile } = vi.hoisted(() => ({
  spawn: vi.fn(),
  access: vi.fn(),
  readFile: vi.fn()
}))
vi.mock('node:child_process', () => ({ spawn }))
vi.mock('node:fs/promises', () => ({ access, readFile }))

import { SpeechSynthesizer } from 'main_renderer/speech'

const child = () =>
  Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stdin: Object.assign(new EventEmitter(), { end: vi.fn() }),
    kill: vi.fn()
  })
let synthesizer: SpeechSynthesizer

beforeEach(() => {
  vi.resetAllMocks()
  access.mockResolvedValue(undefined)
  readFile.mockResolvedValue('{"audio":{"sample_rate":22050}}')
  synthesizer = new SpeechSynthesizer(['/voice'])
})
afterEach(() => {
  synthesizer.cancelAll()
})

describe('offline speech synthesis', () => {
  it('passes document text through stdin and returns a valid mono WAV', async() => {
    const process = child()
    spawn.mockReturnValue(process)
    const result = synthesizer.synthesize(1, 'Hello $(touch /tmp/no).')
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce())
    expect(spawn.mock.calls[0][1]).not.toContain('Hello $(touch /tmp/no).')
    expect(process.stdin.end).toHaveBeenCalledWith('Hello $(touch /tmp/no).\n')
    process.stdout.emit('data', Buffer.from([1, 0, 2, 0]))
    process.emit('close', 0)
    const response = await result
    expect(response.status).toBe('ready')
    if (response.status !== 'ready') throw new Error('Missing audio')
    const wav = Buffer.from(response.audio)
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.readUInt32LE(24)).toBe(22050)
    expect(wav.readUInt32LE(40)).toBe(4)
    expect(wav.length).toBe(48)
  })

  it('cancels only the requesting window and ignores late completion', async() => {
    const first = child()
    const second = child()
    spawn.mockReturnValueOnce(first).mockReturnValueOnce(second)
    const one = synthesizer.synthesize(1, 'Window one.')
    const two = synthesizer.synthesize(2, 'Window two.')
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(2))
    synthesizer.cancel(1)
    expect(await one).toEqual({ status: 'canceled' })
    expect(first.kill).toHaveBeenCalledOnce()
    expect(second.kill).not.toHaveBeenCalled()
    first.emit('close', 0)
    second.stdout.emit('data', Buffer.from([1, 0]))
    second.emit('close', 0)
    expect((await two).status).toBe('ready')
  })

  it('does not spawn a canceled request after file discovery completes', async() => {
    let finish: () => void = () => {}
    access.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const result = synthesizer.synthesize(1, 'Canceled.')
    synthesizer.cancel(1)
    finish()
    expect(await result).toEqual({ status: 'canceled' })
    await vi.waitFor(() => expect(readFile).toHaveBeenCalledOnce())
    expect(spawn).not.toHaveBeenCalled()
  })

  it('rejects oversized input before starting any process', async() => {
    expect(await synthesizer.synthesize(1, 'a'.repeat(1201))).toEqual({
      status: 'error',
      reason: 'invalid'
    })
    expect(spawn).not.toHaveBeenCalled()
  })

  it('reports an unavailable voice and a failed engine', async() => {
    access.mockRejectedValueOnce(new Error('Missing file'))
    expect(await synthesizer.synthesize(1, 'Hello.')).toEqual({
      status: 'error',
      reason: 'unavailable'
    })
    const process = child()
    spawn.mockReturnValue(process)
    const result = synthesizer.synthesize(1, 'Hello.')
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce())
    process.emit('error', new Error('Cannot run engine'))
    expect(await result).toEqual({ status: 'error', reason: 'failed' })
  })
})
