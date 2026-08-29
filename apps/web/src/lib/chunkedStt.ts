import type { LiveSttSession, TranscriptEvent } from './liveStt'
import { startSileroVad, type SpeechDetector, type VadProfile } from './sileroVad'

type ChunkedSttOptions = {
  glossary?: string[]
  sendingOnStart?: boolean
  vadProfile?: VadProfile
  startDetector?: (stream: MediaStream, onSegment: (segment: Blob) => void, profile?: VadProfile) => Promise<SpeechDetector>
}

const MIN_REQUEST_INTERVAL_MS = 6_000

const startDefaultDetector = (stream: MediaStream, onSegment: (segment: Blob) => void, profile?: VadProfile) =>
  startSileroVad(stream, onSegment, undefined, profile)

function recorderMimeType() {
  return MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : undefined
}

function safeGlossary(glossary: string[]) {
  return glossary.slice(0, 20).map((term) => term.trim()).filter((term) => term.length > 0 && term.length <= 50)
}

async function transcribeChunk(blob: Blob, language: 'en' | 'th', glossary: string[]) {
  const response = await fetch('/v1/stt/chunk', {
    method: 'POST',
    headers: {
      'content-type': blob.type || 'audio/webm',
      'x-wa-ngai-language': language,
      'x-wa-ngai-glossary': encodeURIComponent(JSON.stringify(glossary)),
    },
    body: blob,
  })
  if (!response.ok) throw new Error('Transcription unavailable')
  const result = await response.json() as { text?: string }
  if (!result.text) throw new Error('Transcription unavailable')
  return result.text
}

export async function startChunkedStt(
  stream: MediaStream,
  sourceLanguage: 'en' | 'th',
  onEvent: (event: TranscriptEvent) => void,
  { glossary = [], sendingOnStart = false, vadProfile = 'game', startDetector = startDefaultDetector }: ChunkedSttOptions = {},
): Promise<LiveSttSession> {
  const audioStream = new MediaStream(stream.getAudioTracks())
  const options = recorderMimeType() ? { mimeType: recorderMimeType() } : undefined
  const recorder = new MediaRecorder(audioStream, options)
  const cleanGlossary = safeGlossary(glossary)
  let sending = sendingOnStart
  let stopped = false
  let lastRequestAt = Number.NEGATIVE_INFINITY
  let queuedBlob: Blob | undefined
  let uploading = false
  let detector: SpeechDetector | undefined

  const uploadNext = async () => {
    if (uploading || !queuedBlob || stopped) return
    const blob = queuedBlob
    queuedBlob = undefined
    uploading = true
    lastRequestAt = Date.now()
    try {
      const text = await transcribeChunk(blob, sourceLanguage, cleanGlossary)
      if (text) onEvent({ type: 'transcript.final', text, is_final: true, speech_final: true })
    } catch {
      onEvent({ type: 'error' })
    } finally {
      uploading = false
      if (queuedBlob) void uploadNext()
    }
  }

  const enqueue = (blob: Blob) => {
    if (stopped || blob.size === 0 || Date.now() - lastRequestAt < MIN_REQUEST_INTERVAL_MS) return
    queuedBlob = blob
    void uploadNext()
  }

  recorder.ondataavailable = (event) => {
    const isFinalPushToTalkChunk = !sendingOnStart && recorder.state === 'inactive'
    if ((!sending && !isFinalPushToTalkChunk) || event.data.size === 0) return
    enqueue(event.data)
  }

  const startRecording = () => {
    if (recorder.state === 'inactive' && !stopped) recorder.start()
  }

  if (sendingOnStart) {
    detector = await startDetector(audioStream, (segment) => {
      if (sending) enqueue(segment)
    }, vadProfile)
  }

  return {
    finalize: () => {
      if (!sendingOnStart && recorder.state === 'recording') recorder.stop()
    },
    setSending: (enabled) => {
      sending = enabled
      if (enabled) startRecording()
      if (!enabled && !sendingOnStart && recorder.state === 'recording') recorder.stop()
    },
    stop: () => {
      stopped = true
      sending = false
      if (recorder.state !== 'inactive') recorder.stop()
      void detector?.stop()
    },
  }
}
