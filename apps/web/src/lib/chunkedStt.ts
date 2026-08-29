import type { LiveSttSession, TranscriptEvent } from './liveStt'
import { createVoiceGate } from './voiceGate'

type ChunkedSttOptions = {
  glossary?: string[]
  sendingOnStart?: boolean
}

const CHUNK_INTERVAL_MS = 6_000
const MIN_REQUEST_INTERVAL_MS = 6_000

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
  { glossary = [], sendingOnStart = false }: ChunkedSttOptions = {},
): Promise<LiveSttSession> {
  const audioStream = new MediaStream(stream.getAudioTracks())
  const options = recorderMimeType() ? { mimeType: recorderMimeType() } : undefined
  const recorder = new MediaRecorder(audioStream, options)
  const gate = createVoiceGate({ threshold: 0.012, hangoverMs: 450 })
  const cleanGlossary = safeGlossary(glossary)
  let sending = sendingOnStart
  let stopped = false
  let lastRequestAt = Number.NEGATIVE_INFINITY
  let queuedBlob: Blob | undefined
  let uploading = false
  let analyserContext: AudioContext | undefined
  let animationFrame = 0

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
    if (!sendingOnStart || gate.consume(Date.now())) enqueue(event.data)
  }

  if (typeof AudioContext !== 'undefined') {
    analyserContext = new AudioContext()
    const source = analyserContext.createMediaStreamSource(audioStream)
    const analyser = analyserContext.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    const samples = new Float32Array(analyser.fftSize)
    const measure = () => {
      if (stopped) return
      analyser.getFloatTimeDomainData(samples)
      gate.observe(samples, Date.now())
      animationFrame = requestAnimationFrame(measure)
    }
    measure()
  }

  const startRecording = () => {
    if (recorder.state === 'inactive' && !stopped) recorder.start(sendingOnStart ? CHUNK_INTERVAL_MS : undefined)
  }

  if (sendingOnStart) startRecording()

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
      if (animationFrame) cancelAnimationFrame(animationFrame)
      if (recorder.state !== 'inactive') recorder.stop()
      audioStream.getTracks().forEach((track) => track.stop())
      void analyserContext?.close()
    },
  }
}
