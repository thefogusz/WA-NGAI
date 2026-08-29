import { afterEach, describe, expect, it, vi } from 'vitest'

import { startChunkedStt } from './chunkedStt'

class FakeRecorder {
  static latest: FakeRecorder | undefined
  static isTypeSupported = vi.fn(() => true)
  ondataavailable: ((event: BlobEvent) => void) | null = null
  state: RecordingState = 'inactive'
  start = vi.fn(() => { this.state = 'recording' })
  stop = vi.fn(() => { this.state = 'inactive' })
  requestData = vi.fn()

  constructor() { FakeRecorder.latest = this }
}

describe('startChunkedStt', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps the microphone private until push-to-talk then sends one WebM chunk', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'กำลังไป' }), { status: 200 }))
    vi.stubGlobal('MediaRecorder', FakeRecorder)
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('MediaStream', class { constructor() {} })

    const onEvent = vi.fn()
    const session = await startChunkedStt({ getAudioTracks: () => [{}] } as unknown as MediaStream, 'th', onEvent)
    expect(FakeRecorder.latest?.start).not.toHaveBeenCalled()

    session.setSending(true)
    expect(FakeRecorder.latest?.start).toHaveBeenCalledOnce()
    session.setSending(false)
    FakeRecorder.latest?.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) } as BlobEvent)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())

    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ text: 'กำลังไป', is_final: true, speech_final: true })))
  })
})
