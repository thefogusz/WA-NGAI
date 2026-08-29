import { describe, expect, it, vi } from 'vitest'

import { openFloatingWidget } from './pictureInPicture'

describe('openFloatingWidget', () => {
  it('opens a compact PiP window with the current session state', async () => {
    const pipDocument = document.implementation.createHTMLDocument('WANGAI')
    const requestWindow = vi.fn().mockResolvedValue({ document: pipDocument })

    await openFloatingWidget(
      { requestWindow },
      { microphoneReady: true, systemAudioActive: true },
    )

    expect(requestWindow).toHaveBeenCalledWith({ height: 220, width: 360 })
    expect(pipDocument.body.textContent).toContain('WA-NGAI')
    expect(pipDocument.body.textContent).toContain('Listening to shared audio')
    expect(pipDocument.body.textContent).toContain('Mic ready')
    expect(pipDocument.querySelector('[data-wangai-widget]')).not.toBeNull()
  })
})
