import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import App from './App'
import type { BrowserCapabilityReport } from './lib/capabilities'

const readyReport: BrowserCapabilityReport = {
  blockers: [],
  canOpenFloatingWidget: true,
  canStartSession: true,
  copyBehavior: 'available',
  floatingWidgetBehavior: 'picture-in-picture',
}

const supportedMediaDevices = {
  getDisplayMedia: vi.fn(),
  getUserMedia: vi.fn(),
}

describe('WANGAI feasibility harness', () => {
  it('starts setup without exposing provider setup to the user', async () => {
    const user = userEvent.setup()

    render(<App capabilityReport={readyReport} mediaDevices={supportedMediaDevices as never} />)

    expect(screen.getByRole('heading', { name: 'WANGAI' })).toBeVisible()
    expect(screen.queryByText('xAI API key')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Start session' }))

    expect(screen.getByRole('button', { name: 'Share game audio' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Enable microphone' })).toBeVisible()
  })

  it('shows listening state after system audio is granted', async () => {
    const user = userEvent.setup()
    const audioTrack = { readyState: 'live' as const, stop: vi.fn() }
    const displayTrack = { readyState: 'live' as const, stop: vi.fn() }
    const getDisplayMedia = vi.fn().mockResolvedValue({
      getAudioTracks: () => [audioTrack],
      getTracks: () => [audioTrack, displayTrack],
    })
    const getUserMedia = vi.fn()

    render(
      <App
        capabilityReport={readyReport}
        mediaDevices={{ getDisplayMedia, getUserMedia } as never}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Start session' }))
    await user.click(screen.getByRole('button', { name: 'Share game audio' }))

    expect(await screen.findByText('Listening to shared audio')).toBeVisible()
    expect(getDisplayMedia).toHaveBeenCalledOnce()
  })

  it('opens a compact floating widget only from an explicit user action', async () => {
    const user = userEvent.setup()
    const requestWindow = vi.fn().mockResolvedValue({
      document: document.implementation.createHTMLDocument('WANGAI'),
    })

    render(
      <App
        capabilityReport={readyReport}
        mediaDevices={supportedMediaDevices as never}
        pictureInPictureApi={{ requestWindow }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Start session' }))
    await user.click(screen.getByRole('button', { name: 'Open floating widget' }))

    expect(requestWindow).toHaveBeenCalledOnce()
  })
})
