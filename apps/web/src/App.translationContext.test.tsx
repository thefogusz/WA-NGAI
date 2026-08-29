import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

let emitIncoming: ((event: { type: string; text?: string; is_final?: boolean; speech_final?: boolean }) => void) | undefined

vi.mock('./lib/chunkedStt', () => ({
  startChunkedStt: vi.fn(async (_stream, _language, onEvent) => {
    emitIncoming = onEvent
    return { finalize: vi.fn(), setSending: vi.fn(), stop: vi.fn() }
  }),
}))

import App from './App'
import type { BrowserCapabilityReport } from './lib/capabilities'

const report: BrowserCapabilityReport = {
  blockers: [], canOpenFloatingWidget: false, canStartSession: true, copyBehavior: 'available', floatingWidgetBehavior: 'fallback',
}

describe('incoming translation context', () => {
  it('sends only previously committed speech as context for the next translation', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'ไปประตูเหนือ' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'กำลังไป' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('MediaRecorder', class {})
    vi.stubGlobal('MediaStream', class {})

    render(
      <App
        capabilityReport={report}
        mediaDevices={{
          getDisplayMedia: vi.fn().mockResolvedValue({ getAudioTracks: () => [{}], getTracks: () => [{}] }),
          getUserMedia: vi.fn(),
        } as never}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Start session' }))
    await user.click(screen.getByRole('button', { name: 'Share audio' }))

    await act(async () => { emitIncoming?.({ type: 'transcript.final', text: 'Meet at the north gate.', is_final: true, speech_final: true }) })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await act(async () => { emitIncoming?.({ type: 'transcript.final', text: 'I am on my way.', is_final: true, speech_final: true }) })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    expect(JSON.parse(fetchMock.mock.calls[1][1].body).context).toEqual(['Meet at the north gate.'])
  })
})
