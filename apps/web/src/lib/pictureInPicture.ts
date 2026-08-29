export type PictureInPictureApi = {
  requestWindow: (options: { width: number; height: number }) => Promise<Window>
}

export type FloatingWidgetSnapshot = {
  systemAudioActive: boolean
  microphoneReady: boolean
}

const widgetStyles = `
  :root { color: #1d1c24; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  body { margin: 0; min-width: 0; background: transparent; }
  [data-wangai-widget] { background: #fbfaff; border: 1px solid rgba(55, 50, 75, .12); border-radius: 20px; box-sizing: border-box; min-height: 100vh; padding: 16px; }
  .topline { align-items: center; color: #767283; display: flex; font-size: 11px; font-weight: 700; justify-content: space-between; letter-spacing: .1em; }
  .live { align-items: center; color: #297652; display: flex; font-size: 11px; gap: 6px; letter-spacing: 0; }
  .dot { background: #45ad72; border-radius: 50%; height: 7px; width: 7px; }
  .message { background: #f1eff5; border-radius: 14px; color: #272530; font-size: 14px; font-weight: 650; line-height: 1.35; margin-top: 13px; padding: 11px 12px; }
  .translation { color: #75717e; display: block; font-size: 12px; font-weight: 400; margin-top: 4px; }
  .footer { color: #777382; display: flex; font-size: 11px; justify-content: space-between; margin-top: 12px; }
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
    <div class="topline"><span>WANGAI</span><span class="live"><span class="dot"></span>${snapshot.systemAudioActive ? 'Listening' : 'Ready'}</span></div>
    <div class="message">${snapshot.systemAudioActive ? 'Listening to shared audio' : 'Waiting for shared audio'}<span class="translation">${snapshot.systemAudioActive ? 'แปลข้อความเมื่อการเชื่อมต่อพร้อม' : 'เริ่มจากกดแชร์เสียงเกม'}</span></div>
    <div class="footer"><span>${snapshot.microphoneReady ? 'Mic ready' : 'Mic off'}</span><span>External only</span></div>
  `

  document.title = 'WANGAI'
  document.body.replaceChildren(style, root)

  return pipWindow
}
