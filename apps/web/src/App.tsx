import { useEffect, useState } from 'react'

import './App.css'
import {
  MissingSystemAudioTrackError,
  requestMicrophoneCapture,
  requestSystemAudioCapture,
} from './lib/capture'
import {
  detectBrowserCapabilities,
  type BrowserCapabilityReport,
} from './lib/capabilities'
import { stopSessionMedia, type SessionTrack } from './lib/mediaLifecycle'
import { openFloatingWidget, type PictureInPictureApi } from './lib/pictureInPicture'

type AppMediaDevices = Pick<MediaDevices, 'getDisplayMedia' | 'getUserMedia'>
type CaptureStatus = 'idle' | 'requesting' | 'active' | 'error'

type AppProps = {
  capabilityReport?: BrowserCapabilityReport
  mediaDevices?: AppMediaDevices
  pictureInPictureApi?: PictureInPictureApi
}

type SupportedLanguage = 'en' | 'th'

const languageLabels: Record<SupportedLanguage, string> = {
  en: 'English',
  th: 'Thai',
}

function getDefaultMediaDevices(): AppMediaDevices | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.mediaDevices
}

function getDefaultPictureInPictureApi(): PictureInPictureApi | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  return (
    window as Window & { documentPictureInPicture?: PictureInPictureApi }
  ).documentPictureInPicture
}

function describeCaptureError(error: unknown, fallback: string): string {
  if (error instanceof MissingSystemAudioTrackError) {
    return 'No audio track arrived. Share a screen and enable Share system audio.'
  }

  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Permission was not granted. You can try again when ready.'
  }

  return fallback
}

function App({
  capabilityReport,
  mediaDevices = getDefaultMediaDevices(),
  pictureInPictureApi = getDefaultPictureInPictureApi(),
}: AppProps) {
  const report = capabilityReport ?? detectBrowserCapabilities()
  const [setupStarted, setSetupStarted] = useState(false)
  const [systemStatus, setSystemStatus] = useState<CaptureStatus>('idle')
  const [microphoneStatus, setMicrophoneStatus] = useState<CaptureStatus>('idle')
  const [systemTracks, setSystemTracks] = useState<SessionTrack[]>([])
  const [microphoneTracks, setMicrophoneTracks] = useState<SessionTrack[]>([])
  const [pttActive, setPttActive] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [theirLanguage, setTheirLanguage] = useState<SupportedLanguage>('en')
  const [myLanguage, setMyLanguage] = useState<SupportedLanguage>('th')
  const [shortcut, setShortcut] = useState<string | undefined>()
  const [shortcutCapture, setShortcutCapture] = useState(false)
  const [notice, setNotice] = useState<string | undefined>()

  const startSystemAudio = async () => {
    if (!mediaDevices) {
      setSystemStatus('error')
      setNotice('This browser does not expose capture controls.')
      return
    }

    setNotice(undefined)
    setSystemStatus('requesting')

    try {
      const capture = await requestSystemAudioCapture({
        getDisplayMedia: (options) => mediaDevices.getDisplayMedia(options),
      })
      setSystemTracks(capture.allTracks)
      setSystemStatus('active')
    } catch (error) {
      setSystemStatus('error')
      setNotice(describeCaptureError(error, 'Could not start shared audio. Try again.'))
    }
  }

  const startMicrophone = async () => {
    if (!mediaDevices) {
      setMicrophoneStatus('error')
      setNotice('This browser does not expose microphone controls.')
      return
    }

    setNotice(undefined)
    setMicrophoneStatus('requesting')

    try {
      const capture = await requestMicrophoneCapture({
        getUserMedia: (options) => mediaDevices.getUserMedia(options),
      })
      setMicrophoneTracks(capture.allTracks)
      setMicrophoneStatus('active')
    } catch (error) {
      setMicrophoneStatus('error')
      setNotice(describeCaptureError(error, 'Could not start the microphone. Try again.'))
    }
  }

  const endSession = async () => {
    await stopSessionMedia([...systemTracks, ...microphoneTracks])
    setSystemTracks([])
    setMicrophoneTracks([])
    setPttActive(false)
    setSystemStatus('idle')
    setMicrophoneStatus('idle')
    setSetupStarted(false)
    setNotice('Session ended. Audio capture is off.')
  }

  const openWidget = async () => {
    if (!pictureInPictureApi) {
      setNotice('This browser cannot open the floating widget. Use the compact page instead.')
      return
    }

    try {
      await openFloatingWidget(pictureInPictureApi, {
        microphoneReady: microphoneStatus === 'active',
        systemAudioActive: systemStatus === 'active',
      })
      setNotice(undefined)
    } catch {
      setNotice('Could not open the floating widget. You can keep using the compact page.')
    }
  }

  const canRequestCapture = report.canStartSession && Boolean(mediaDevices)
  const systemLabel =
    systemStatus === 'active' ? 'Listening to shared audio' : 'Game / Discord audio'
  const microphoneLabel =
    microphoneStatus === 'active' ? 'Microphone ready' : 'Your microphone'
  const stopPushToTalk = () => setPttActive(false)
  const incomingLanguage = theirLanguage === 'en' ? 'th' : 'en'
  const outgoingLanguage = myLanguage === 'en' ? 'th' : 'en'
  const incomingDirection = `${languageLabels[theirLanguage]} → ${languageLabels[incomingLanguage]}`
  const outgoingDirection = `${languageLabels[myLanguage]} → ${languageLabels[outgoingLanguage]}`

  const captureShortcut = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!shortcutCapture) {
      return
    }
    if (event.key === 'Escape') {
      setShortcutCapture(false)
      return
    }
    if (['Alt', 'Control', 'Meta', 'Shift'].includes(event.key)) {
      return
    }

    event.preventDefault()
    setShortcut(event.key.length === 1 ? event.key.toUpperCase() : event.key)
    setShortcutCapture(false)
  }

  useEffect(() => {
    if (!shortcut || !setupStarted || microphoneStatus !== 'active') {
      return undefined
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!shortcutCapture && !event.repeat && event.key.toUpperCase() === shortcut) {
        event.preventDefault()
        setPttActive(true)
      }
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (!shortcutCapture && event.key.toUpperCase() === shortcut) {
        event.preventDefault()
        setPttActive(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [microphoneStatus, setupStarted, shortcut, shortcutCapture])

  return (
    <main className="app-shell">
      <section className="intro-panel" aria-labelledby="app-title">
        <p className="eyebrow">LIVE TRANSLATION</p>
        <h1 id="app-title">WA-NGAI <span>ว่าไง</span></h1>
      </section>

      <section className="widget-card" aria-labelledby="session-title">
        <div className="widget-topline">
          <div>
            <p className="eyebrow">SESSION</p>
            <h2 id="session-title">{setupStarted ? 'Your live space' : 'Ready when you are'}</h2>
          </div>
          <div className="widget-actions">
            <span className={`status-pill ${systemStatus === 'active' ? 'is-active' : ''}`}>
              <span aria-hidden="true" className="status-dot" />
              {systemStatus === 'active' ? 'Listening' : 'Private'}
            </span>
            <button
              aria-expanded={settingsOpen}
              className="settings-button"
              type="button"
              onClick={() => setSettingsOpen((isOpen) => !isOpen)}
            >
              Settings
            </button>
          </div>
        </div>

        {settingsOpen && (
          <section className="settings-panel" aria-label="Session settings">
            <div className="settings-heading">
              <div>
                <span className="source-kicker">LANGUAGES</span>
                <strong>Keep both sides clear</strong>
              </div>
              <div className="direction-summary">
                <span>{incomingDirection}</span>
                <span>{outgoingDirection}</span>
              </div>
            </div>
            <div className="language-grid">
              <label>
                <span>They speak</span>
                <select value={theirLanguage} onChange={(event) => setTheirLanguage(event.target.value as SupportedLanguage)}>
                  <option value="en">English</option>
                  <option value="th">Thai</option>
                </select>
              </label>
              <label>
                <span>I speak</span>
                <select value={myLanguage} onChange={(event) => setMyLanguage(event.target.value as SupportedLanguage)}>
                  <option value="th">Thai</option>
                  <option value="en">English</option>
                </select>
              </label>
            </div>
            <div className="shortcut-row">
              <div>
                <span className="source-kicker">PUSH TO TALK</span>
                <strong>{shortcut ? `Shortcut ${shortcut}` : 'Hold the widget button'}</strong>
                <span>Browser shortcut works while WA-NGAI is focused.</span>
              </div>
              <button
                aria-label={shortcut ? `Shortcut ${shortcut}` : 'Set shortcut'}
                className="shortcut-button"
                type="button"
                onClick={() => setShortcutCapture(true)}
                onKeyDown={captureShortcut}
              >
                {shortcutCapture ? 'Press a key' : shortcut ? shortcut : 'Set'}
              </button>
            </div>
          </section>
        )}

        {!setupStarted ? (
          <div className="welcome-state">
            <div className="conversation-preview" aria-hidden="true">
              <div className="message message-incoming">
                <strong>Join us at the north gate.</strong>
                <span>ไปรวมกันที่ประตูเหนือ</span>
              </div>
              <div className="message message-outgoing">
                <strong>On my way.</strong>
                <span>กำลังไป</span>
              </div>
            </div>
            <button
              className="primary-button"
              type="button"
              disabled={!canRequestCapture}
              onClick={() => setSetupStarted(true)}
            >
              Start session
            </button>
            {!report.canStartSession && (
              <p className="inline-note">Check browser support below before starting.</p>
            )}
          </div>
        ) : (
          <div className="setup-state">
            <p className="setup-intro">Enable the two sources you want WANGAI to use.</p>

            <div className={`source-row ${systemStatus === 'active' ? 'is-active' : ''}`}>
              <div className="source-copy">
                <span className="source-kicker">INCOMING</span>
                <strong>{systemLabel}</strong>
                <span>Choose a screen, then enable system audio.</span>
              </div>
              <button
                className="secondary-button"
                type="button"
                disabled={!canRequestCapture || systemStatus === 'requesting' || systemStatus === 'active'}
                onClick={startSystemAudio}
              >
                {systemStatus === 'requesting' ? 'Waiting…' : systemStatus === 'active' ? 'Connected' : 'Share audio'}
              </button>
            </div>

            <div className={`source-row ${microphoneStatus === 'active' ? 'is-active' : ''}`}>
              <div className="source-copy">
                <span className="source-kicker">OUTGOING</span>
                <strong>{microphoneLabel}</strong>
                <span>Used only when you choose to reply.</span>
              </div>
              <button
                className="secondary-button"
                type="button"
                disabled={!canRequestCapture || microphoneStatus === 'requesting' || microphoneStatus === 'active'}
                onClick={startMicrophone}
              >
                {microphoneStatus === 'requesting' ? 'Waiting…' : microphoneStatus === 'active' ? 'Connected' : 'Enable microphone'}
              </button>
            </div>

            {microphoneStatus === 'active' && (
              <section className="ptt-panel" aria-labelledby="ptt-title">
                <div className="ptt-copy">
                  <span className="source-kicker">THAI REPLY</span>
                  <strong id="ptt-title">{pttActive ? `Listening in ${languageLabels[myLanguage]}` : `Hold to speak ${languageLabels[myLanguage]}`}</strong>
                  <span>{pttActive ? 'Release to finalize your reply.' : 'Your English reply will appear on the right.'}</span>
                </div>
                <button
                  aria-label={pttActive ? `Listening in ${languageLabels[myLanguage]}` : `Hold to speak ${languageLabels[myLanguage]}`}
                  className={`ptt-button ${pttActive ? 'is-active' : ''}`}
                  type="button"
                  onPointerCancel={stopPushToTalk}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture?.(event.pointerId)
                    setNotice(undefined)
                    setPttActive(true)
                  }}
                  onPointerUp={stopPushToTalk}
                >
                  {pttActive ? 'Release' : 'Hold'}
                </button>
              </section>
            )}

            {microphoneStatus === 'active' && (
              <div className="reply-preview" aria-live="polite">
                <span className="source-kicker">YOUR REPLY</span>
                <strong>{pttActive ? '…' : 'Ready when you are'}</strong>
              </div>
            )}

            {report.canOpenFloatingWidget && (
              <button className="widget-open-button" type="button" onClick={openWidget}>
                Open overlay
              </button>
            )}
            <button className="text-button" type="button" onClick={endSession}>
              End session
            </button>
          </div>
        )}

        {notice && <p className="notice" role="status">{notice}</p>}
      </section>
    </main>
  )
}

export default App
