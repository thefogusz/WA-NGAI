export type PictureInPictureApi = {
  requestWindow: (options: { width: number; height: number }) => Promise<Window>
}

export type FloatingWidgetSnapshot = {
  systemAudioActive: boolean
  microphoneReady: boolean
}

const widgetStyles = `
  :root { color: #f7f7fb; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  body { margin: 0; min-width: 0; background: transparent; }
  [data-wangai-widget] { background: #15161b; border: 1px solid rgba(255, 255, 255, .11); border-radius: 18px; box-sizing: border-box; min-height: 100vh; padding: 16px; }
  .topline { align-items: center; color: #9ea1ac; display: flex; font-size: 11px; font-weight: 700; justify-content: space-between; letter-spacing: .1em; }
  .brand-thai { color: #737681; font-size: 10px; font-weight: 500; letter-spacing: 0; margin-left: 5px; }
  .live { align-items: center; color: #75d5a0; display: flex; font-size: 11px; gap: 6px; letter-spacing: 0; }
  .dot { background: #62ce90; border-radius: 50%; box-shadow: 0 0 0 3px rgba(98, 206, 144, .12); height: 7px; width: 7px; }
  .message { background: #22242c; border: 1px solid rgba(255, 255, 255, .06); border-radius: 13px; color: #f8f8fb; font-size: 14px; font-weight: 650; line-height: 1.35; margin-top: 13px; padding: 11px 12px; }
  .translation { color: #a8aab4; display: block; font-size: 12px; font-weight: 400; margin-top: 4px; }
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
    <div class="topline"><span>WA-NGAI <span class="brand-thai">ว่าไง</span></span><span class="live"><span class="dot"></span>${snapshot.systemAudioActive ? 'Listening' : 'Ready'}</span></div>
    <div class="message">${snapshot.systemAudioActive ? 'Listening to shared audio' : 'Waiting for shared audio'}<span class="translation">${snapshot.systemAudioActive ? 'แปลข้อความเมื่อการเชื่อมต่อพร้อม' : 'เริ่มจากกดแชร์เสียงเกม'}</span></div>
    <div class="footer"><span>${snapshot.microphoneReady ? 'Mic ready' : 'Mic off'}</span><span>External only</span></div>
  `

  document.title = 'WANGAI'
  document.body.replaceChildren(style, root)

  return pipWindow
}
