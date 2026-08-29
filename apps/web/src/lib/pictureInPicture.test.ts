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
    expect(pipDocument.body.textContent).toContain('WANGAI')
    expect(pipDocument.querySelector('.topline')?.textContent).not.toContain('ว่าไง')
    expect(pipDocument.body.textContent).toContain('Listening to shared audio')
    expect(pipDocument.querySelector('[data-wangai-mic-status]')?.textContent).toContain('Mic on')
    expect(pipDocument.querySelector('[data-wangai-audio-status]')?.textContent).toContain('Audio on')
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
    expect(pipDocument.querySelector('[data-wangai-incoming-translation]')?.getAttribute('lang')).toBe('th')
    const reply = pipDocument.querySelector('[data-wangai-reply]')
    expect(reply?.querySelector('strong')?.textContent).toBe('กำลังไป')
    expect(reply?.querySelector('strong')?.getAttribute('lang')).toBe('th')
    expect(reply?.textContent).toContain('Translation · On my way.')
    expect(reply?.hasAttribute('hidden')).toBe(false)

    updateFloatingWidget(pipWindow, {
      incomingText: 'Bridge clear.',
      incomingPendingText: 'I am crossing now.',
      microphoneReady: true,
      systemAudioActive: true,
    })
    expect(pipDocument.querySelector('[data-wangai-incoming]')?.textContent).toBe('Bridge clear.')
    expect(pipDocument.querySelector('[data-wangai-incoming-translation]')?.textContent).toBe('')
    expect(pipDocument.querySelector('[data-wangai-pending]')?.textContent).toContain('I am crossing now.')

    updateFloatingWidget(pipWindow, {
      microphoneReady: false,
      systemAudioActive: false,
    })
    expect(pipDocument.querySelector('[data-wangai-mic-status]')?.textContent).toContain('Mic off')
    expect(pipDocument.querySelector('[data-wangai-audio-status]')?.textContent).toContain('Audio off')
  })
})
