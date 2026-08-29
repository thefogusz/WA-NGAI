import { describe, expect, it, vi } from 'vitest'

import { openFloatingWidget, updateFloatingWidget } from './pictureInPicture'

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

  it('renders transcript updates as text, including a right-side reply', async () => {
    const pipDocument = document.implementation.createHTMLDocument('WA-NGAI')
    const pipWindow = { document: pipDocument, closed: false } as unknown as Window

    await openFloatingWidget(
      { requestWindow: vi.fn().mockResolvedValue(pipWindow) },
      { microphoneReady: true, systemAudioActive: true },
    )
    updateFloatingWidget(pipWindow, {
      incomingText: '<b>North gate</b>',
      incomingTranslation: 'ประตูเหนือ',
      microphoneReady: true,
      replyText: 'กำลังไป',
      replyTranslation: 'On my way.',
      systemAudioActive: true,
    })

    expect(pipDocument.querySelector('[data-wangai-incoming]')?.textContent).toBe('<b>North gate</b>')
    expect(pipDocument.body.textContent).toContain('ประตูเหนือ')
    const reply = pipDocument.querySelector('[data-wangai-reply]')
    expect(reply?.querySelector('strong')?.textContent).toBe('กำลังไป')
    expect(reply?.textContent).toContain('Translation · On my way.')
    expect(reply?.hasAttribute('hidden')).toBe(false)
  })
})
