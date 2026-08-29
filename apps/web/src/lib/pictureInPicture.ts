export type PictureInPictureApi = {
  requestWindow: (options: { width: number; height: number }) => Promise<Window>
}

export type FloatingWidgetSnapshot = {
  incomingText?: string
  incomingTranslation?: string
  incomingPendingText?: string
  systemAudioActive: boolean
  microphoneReady: boolean
  replyText?: string
  replyTranslation?: string
}

const widgetStyles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400..800&family=Noto+Sans+Thai:wght@400;500;600;700;800&display=swap');
  :root { color: #f7f7fb; font-family: "DM Sans", Inter, ui-sans-serif, system-ui, sans-serif; }
  body { margin: 0; min-width: 0; background: transparent; }
  [data-wangai-widget] { background: #15161b; border: 1px solid rgba(255, 255, 255, .11); border-radius: 18px; box-sizing: border-box; min-height: 100vh; padding: 16px; }
  .topline { align-items: center; color: #9ea1ac; display: flex; font-size: 11px; font-weight: 700; justify-content: space-between; letter-spacing: .1em; }
  .brand-thai { color: #8d91a0; font-family: "Noto Sans Thai", "Leelawadee UI", Tahoma, sans-serif; font-size: 10px; font-weight: 600; letter-spacing: 0; margin-left: 5px; }
  .live { align-items: center; color: #75d5a0; display: flex; font-size: 11px; gap: 6px; letter-spacing: 0; }
  .dot { background: #62ce90; border-radius: 50%; box-shadow: 0 0 0 3px rgba(98, 206, 144, .12); height: 7px; width: 7px; }
  .message { background: #22242c; border: 1px solid rgba(255, 255, 255, .06); border-radius: 13px; color: #f8f8fb; font-size: 14px; font-weight: 650; line-height: 1.35; margin-top: 13px; padding: 11px 12px; }
  .translation { color: #a8aab4; display: block; font-size: 12px; font-weight: 400; margin-top: 4px; }
  :lang(th) { font-family: "Noto Sans Thai", "Leelawadee UI", Tahoma, sans-serif; }
  .translation:lang(th), .message strong:lang(th) { color: #d1d4de; font-size: 13px; font-weight: 500; line-height: 1.65; }
  .pending { border-left: 2px solid rgba(117, 213, 160, .72); color: #d7d9e0; padding-left: 10px; }
  .reply { background: #1d2922; margin-left: 42px; text-align: right; }
  .footer { color: #878a95; display: flex; font-size: 11px; justify-content: space-between; margin-top: 12px; }
`

export async function openFloatingWidget(
  api: PictureInPictureApi,
  snapshot: FloatingWidgetSnapshot,
): Promise<Window> {
  const pipWindow = await api.requestWindow({ width: 360, height: 220 })
  const { document } = pipWindow
  const style = document.createElement('style')
  style.textContent = widgetStyles

  const root = document.createElement('main')
  root.dataset.wangaiWidget = 'true'
  root.innerHTML = `
    <div class="topline"><span>WA-NGAI <span class="brand-thai" lang="th">ว่าไง</span></span><span class="live"><span class="dot"></span>${snapshot.systemAudioActive ? 'Listening' : 'Ready'}</span></div>
    <div class="message"><strong data-wangai-incoming>${snapshot.systemAudioActive ? 'Listening to shared audio' : 'Waiting for shared audio'}</strong><span class="translation" data-wangai-incoming-translation lang="th">${snapshot.systemAudioActive ? 'แปลข้อความเมื่อการเชื่อมต่อพร้อม' : 'เริ่มจากกดแชร์เสียงเกม'}</span></div>
    <div class="message pending" data-wangai-pending hidden><strong></strong><span class="translation">Translating…</span></div>
    <div class="message reply" data-wangai-reply hidden><strong></strong><span class="translation"></span></div>
    <div class="footer"><span>${snapshot.microphoneReady ? 'Mic ready' : 'Mic off'}</span><span>External only</span></div>
  `

  document.title = 'WA-NGAI'
  document.body.replaceChildren(style, root)
  updateFloatingWidget(pipWindow, snapshot)

  return pipWindow
}

export function updateFloatingWidget(pipWindow: Window, snapshot: FloatingWidgetSnapshot): void {
  const document = pipWindow.document
  const incoming = document.querySelector<HTMLElement>('[data-wangai-incoming]')
  const incomingTranslation = document.querySelector<HTMLElement>('[data-wangai-incoming-translation]')
  const pending = document.querySelector<HTMLElement>('[data-wangai-pending]')
  const reply = document.querySelector<HTMLElement>('[data-wangai-reply]')

  if (incoming && snapshot.incomingText) setWidgetText(incoming, snapshot.incomingText)
  if (incomingTranslation) setWidgetText(incomingTranslation, snapshot.incomingTranslation ?? '')
  if (pending) {
    pending.hidden = !snapshot.incomingPendingText
    if (snapshot.incomingPendingText) setWidgetText(pending.querySelector('strong')!, snapshot.incomingPendingText)
  }
  if (reply && (snapshot.replyText || snapshot.replyTranslation)) {
    reply.hidden = false
    setWidgetText(reply.querySelector('strong')!, snapshot.replyText ?? snapshot.replyTranslation ?? '')
    setWidgetText(reply.querySelector('.translation')!, snapshot.replyTranslation
      ? `Translation · ${snapshot.replyTranslation}`
      : '')
  }
}

function setWidgetText(element: HTMLElement, text: string) {
  element.textContent = text
  if (/[\u0E00-\u0E7F]/.test(text)) element.lang = 'th'
  else element.removeAttribute('lang')
}
