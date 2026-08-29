import { useEffect, useRef, useState } from 'react'

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
import { openFloatingWidget, updateFloatingWidget, type PictureInPictureApi } from './lib/pictureInPicture'
import { startChunkedStt } from './lib/chunkedStt'
import { startLiveStt, type LiveSttSession, type TranscriptEvent } from './lib/liveStt'
import { appendCommittedText } from './lib/translationContext'
import type { VadProfile } from './lib/sileroVad'

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

function parseGlossary(value: string): string[] {
  return value.split(',').map((term) => term.trim()).filter(Boolean).slice(0, 20)
}

function supportsChunkedStt() {
  return typeof MediaRecorder !== 'undefined' && typeof MediaStream !== 'undefined'
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

async function translateText(text: string, sourceLanguage: SupportedLanguage, targetLanguage: SupportedLanguage, context: string[] = []): Promise<string> {
  const response = await fetch('/v1/translate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sourceLanguage, targetLanguage, text, context }),
  })
  if (!response.ok) throw new Error('Translation unavailable')
  const result = await response.json() as { text?: string }
  if (!result.text) throw new Error('Translation unavailable')
  return result.text
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
  const [gameGlossary, setGameGlossary] = useState('')
  const [vadProfile, setVadProfile] = useState<VadProfile>('game')
  const [incomingText, setIncomingText] = useState<string | undefined>()
  const [incomingTranslation, setIncomingTranslation] = useState<string | undefined>()
  const [replyText, setReplyText] = useState<string | undefined>()
  const [replyTranslation, setReplyTranslation] = useState<string | undefined>()
  const [replyDraft, setReplyDraft] = useState<string | undefined>()
  const systemSttRef = useRef<LiveSttSession | null>(null)
  const microphoneSttRef = useRef<LiveSttSession | null>(null)
  const incomingHistoryRef = useRef<string[]>([])
  const outgoingHistoryRef = useRef<string[]>([])
  const incomingTranslationRequestRef = useRef(0)
  const outgoingTranslationRequestRef = useRef(0)
  const pipWindowRef = useRef<Window | null>(null)
  const [notice, setNotice] = useState<string | undefined>()

  const startSystemAudio = async () => {
    if (!mediaDevices) {
      setSystemStatus('error')
      setNotice('This browser does not expose capture controls.')
      return
    }

    setNotice(undefined)
    setSystemStatus('requesting')
    let capture: Awaited<ReturnType<typeof requestSystemAudioCapture>> | undefined

    try {
      capture = await requestSystemAudioCapture({
        getDisplayMedia: (options) => mediaDevices.getDisplayMedia(options),
      })
      setSystemTracks(capture.allTracks)
      if (supportsChunkedStt()) {
        systemSttRef.current = await startChunkedStt(capture.stream as MediaStream, theirLanguage, async (event: TranscriptEvent) => {
          if (event.type === 'error') {
            setNotice('Speech could not be transcribed. Shared audio is still connected.')
            return
          }
          if (!event.text) return
          setIncomingText(event.text)
          if (event.is_final && event.speech_final) {
            const context = incomingHistoryRef.current
            incomingHistoryRef.current = appendCommittedText(context, event.text)
            const requestId = ++incomingTranslationRequestRef.current
            try {
              const translation = await translateText(event.text, theirLanguage, incomingLanguage, context)
              if (requestId === incomingTranslationRequestRef.current) setIncomingTranslation(translation)
            } catch { setNotice('Translation is temporarily unavailable.') }
          }
        }, { sendingOnStart: true, glossary: parseGlossary(gameGlossary), vadProfile })
      } else if (typeof window.AudioContext !== 'undefined') {
        systemSttRef.current = await startLiveStt(capture.stream as MediaStream, theirLanguage, async (event: TranscriptEvent) => {
          if (event.type === 'error') {
            setNotice('Speech could not be transcribed. Shared audio is still connected.')
            return
          }
          if (event.type !== 'transcript.partial' || !event.text) return
          setIncomingText(event.text)
          if (event.is_final && event.speech_final) {
            const context = incomingHistoryRef.current
            incomingHistoryRef.current = appendCommittedText(context, event.text)
            const requestId = ++incomingTranslationRequestRef.current
            try {
              const translation = await translateText(event.text, theirLanguage, incomingLanguage, context)
              if (requestId === incomingTranslationRequestRef.current) setIncomingTranslation(translation)
            } catch { setNotice('Translation is temporarily unavailable.') }
          }
        }, { sendingOnStart: true })
      }
      setSystemStatus('active')
    } catch (error) {
      if (capture) {
        await stopSessionMedia(capture.allTracks)
        setSystemTracks([])
      }
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
    let capture: Awaited<ReturnType<typeof requestMicrophoneCapture>> | undefined

    try {
      capture = await requestMicrophoneCapture({
        getUserMedia: (options) => mediaDevices.getUserMedia(options),
      })
      setMicrophoneTracks(capture.allTracks)
      if (supportsChunkedStt()) {
        microphoneSttRef.current = await startChunkedStt(capture.stream as MediaStream, myLanguage, async (event: TranscriptEvent) => {
          if (!event.text) return
          setReplyText(event.text)
          setReplyDraft(undefined)
          if (event.is_final && event.speech_final) {
            const context = outgoingHistoryRef.current
            outgoingHistoryRef.current = appendCommittedText(context, event.text)
            const requestId = ++outgoingTranslationRequestRef.current
            try {
              const translation = await translateText(event.text, myLanguage, outgoingLanguage, context)
              if (requestId === outgoingTranslationRequestRef.current) {
                setReplyTranslation(translation)
                setReplyDraft(translation)
              }
            } catch { setNotice('Translation is temporarily unavailable.') }
          }
        }, { glossary: parseGlossary(gameGlossary) })
      } else if (typeof window.AudioContext !== 'undefined') {
        microphoneSttRef.current = await startLiveStt(capture.stream as MediaStream, myLanguage, async (event: TranscriptEvent) => {
          if (event.type !== 'transcript.partial' || !event.text) return
          setReplyText(event.text)
          setReplyDraft(undefined)
          if (event.is_final && event.speech_final) {
            const context = outgoingHistoryRef.current
            outgoingHistoryRef.current = appendCommittedText(context, event.text)
            const requestId = ++outgoingTranslationRequestRef.current
            try {
              const translation = await translateText(event.text, myLanguage, outgoingLanguage, context)
              if (requestId === outgoingTranslationRequestRef.current) {
                setReplyTranslation(translation)
                setReplyDraft(translation)
              }
            } catch { setNotice('Translation is temporarily unavailable.') }
          }
        })
      }
      setMicrophoneStatus('active')
    } catch (error) {
      if (capture) {
        await stopSessionMedia(capture.allTracks)
        setMicrophoneTracks([])
      }
      setMicrophoneStatus('error')
      setNotice(describeCaptureError(error, 'Could not start the microphone. Try again.'))
    }
  }

  const endSession = async () => {
    systemSttRef.current?.stop()
    microphoneSttRef.current?.stop()
    systemSttRef.current = null
    microphoneSttRef.current = null
    await stopSessionMedia([...systemTracks, ...microphoneTracks])
    setSystemTracks([])
    setMicrophoneTracks([])
    setPttActive(false)
    setSystemStatus('idle')
    setMicrophoneStatus('idle')
    incomingHistoryRef.current = []
    outgoingHistoryRef.current = []
    incomingTranslationRequestRef.current += 1
    outgoingTranslationRequestRef.current += 1
    setSetupStarted(false)
    setNotice('Session ended. Audio capture is off.')
  }

  const openWidget = async () => {
    if (!pictureInPictureApi) {
      setNotice('This browser cannot open the floating widget. Use the compact page instead.')
      return
    }

    try {
      pipWindowRef.current = await openFloatingWidget(pictureInPictureApi, {
        incomingText,
        incomingTranslation,
        microphoneReady: microphoneStatus === 'active',
        replyText,
        replyTranslation,
        systemAudioActive: systemStatus === 'active',
      })
      setNotice(undefined)
    } catch {
      setNotice('Could not open the floating widget. You can keep using the compact page.')
    }
  }

  const copyReply = async () => {
    if (!replyDraft || !navigator.clipboard) {
      setNotice('Copy is not available in this browser.')
      return
    }
    try {
      await navigator.clipboard.writeText(replyDraft)
      setNotice(`${languageLabels[outgoingLanguage]} translation copied.`)
    } catch {
      setNotice('Could not copy the reply. Select it manually.')
    }
  }

  const canRequestCapture = report.canStartSession && Boolean(mediaDevices)
  const systemLabel =
    systemStatus === 'active' ? 'Listening to shared audio' : 'Game / Discord audio'
  const microphoneLabel =
    microphoneStatus === 'active' ? 'Microphone ready' : 'Your microphone'
  const stopPushToTalk = () => {
    microphoneSttRef.current?.setSending(false)
    microphoneSttRef.current?.finalize()
    setPttActive(false)
  }
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
        microphoneSttRef.current?.setSending(true)
        setPttActive(true)
      }
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (!shortcutCapture && event.key.toUpperCase() === shortcut) {
        event.preventDefault()
        stopPushToTalk()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [microphoneStatus, setupStarted, shortcut, shortcutCapture])

  useEffect(() => {
    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      updateFloatingWidget(pipWindowRef.current, {
        incomingText,
        incomingTranslation,
        microphoneReady: microphoneStatus === 'active',
        replyText,
        replyTranslation,
        systemAudioActive: systemStatus === 'active',
      })
    }
  }, [incomingText, incomingTranslation, microphoneStatus, replyText, replyTranslation, systemStatus])

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
            <label className="glossary-field">
              <span className="source-kicker">GAME TERMS <em>optional</em></span>
              <input
                aria-label="Game terms"
                maxLength={500}
                onChange={(event) => setGameGlossary(event.target.value)}
                placeholder="Apex, north gate, teammate"
                value={gameGlossary}
              />
              <small>Comma-separated names help spelling; kept only in this session.</small>
            </label>
            <label className="audio-profile-field">
              <span className="source-kicker">INCOMING AUDIO</span>
              <select aria-label="Incoming audio" onChange={(event) => setVadProfile(event.target.value as VadProfile)} value={vadProfile}>
                <option value="game">Game · balanced</option>
                <option value="discord">Discord · responsive</option>
                <option value="video">Video · clear sentences</option>
              </select>
              <small>{vadProfile === 'discord' ? 'Responds faster to short voice-chat turns.' : vadProfile === 'video' ? 'Waits longer for complete spoken sentences.' : 'Balanced for mixed game and voice audio.'}</small>
            </label>
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

            {incomingText && (
              <div className="incoming-preview" aria-live="polite" key={incomingText}>
                <span className="source-kicker">THEM</span>
                <strong>{incomingText}</strong>
                {incomingTranslation && <span>{incomingTranslation}</span>}
              </div>
            )}

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
                  <span>{pttActive ? `${languageLabels[myLanguage]} text is appearing live. Release to translate.` : `Your ${languageLabels[myLanguage]} text appears first. Translation follows.`}</span>
                </div>
                <button
                  aria-label={pttActive ? `Listening in ${languageLabels[myLanguage]}` : `Hold to speak ${languageLabels[myLanguage]}`}
                  className={`ptt-button ${pttActive ? 'is-active' : ''}`}
                  type="button"
                  onPointerCancel={stopPushToTalk}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture?.(event.pointerId)
                    setNotice(undefined)
                    microphoneSttRef.current?.setSending(true)
                    setPttActive(true)
                  }}
                  onPointerUp={stopPushToTalk}
                >
                  {pttActive ? 'Release' : 'Hold'}
                </button>
              </section>
            )}

            {microphoneStatus === 'active' && (
              <div className="reply-preview" aria-live="polite" key={replyTranslation ?? 'ready'}>
                <span className="source-kicker">YOUR WORDS</span>
                <strong>{replyText ?? (pttActive ? 'Listening…' : 'Ready when you are')}</strong>
                {replyTranslation && (
                  <label className="reply-editor">
                    <span>{languageLabels[outgoingLanguage]} translation</span>
                    <textarea
                      aria-label={`${languageLabels[outgoingLanguage]} reply`}
                      onChange={(event) => setReplyDraft(event.target.value)}
                      rows={2}
                      value={replyDraft ?? replyTranslation}
                    />
                  </label>
                )}
                {replyTranslation && <button className="copy-button" type="button" onClick={copyReply}>Copy {languageLabels[outgoingLanguage]}</button>}
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
