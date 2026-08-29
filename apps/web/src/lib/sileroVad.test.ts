import { describe, expect, it, vi } from 'vitest'

import { startSileroVad } from './sileroVad'

describe('startSileroVad', () => {
  it('uses the existing capture stream and emits only a finished speech segment', async () => {
    const onSegment = vi.fn()
    const destroy = vi.fn().mockResolvedValue(undefined)
    let onSpeechEnd: ((audio: Float32Array) => void) | undefined
    const vad = {
      new: vi.fn(async (options) => {
        onSpeechEnd = options.onSpeechEnd
        return { destroy, start: vi.fn().mockResolvedValue(undefined) }
      }),
    }
    const stream = {} as MediaStream

    const detector = await startSileroVad(stream, onSegment, vad as never)
    expect(vad.new).toHaveBeenCalledWith(expect.objectContaining({
      baseAssetPath: '/vad/',
      model: 'v5',
      onnxWASMBasePath: '/vad/',
    }))

    onSpeechEnd?.(new Float32Array([0, 0.25, -0.25]))
    expect(onSegment).toHaveBeenCalledWith(expect.objectContaining({ type: 'audio/wav' }))

    await detector.stop()
    expect(destroy).toHaveBeenCalledOnce()
  })
})
