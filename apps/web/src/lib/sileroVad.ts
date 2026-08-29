import { createSpeechSegmentBlob } from './speechSegment'

type MicVadFactory = Pick<typeof import('@ricky0123/vad-web').MicVAD, 'new'>

export type SpeechDetector = {
  stop: () => Promise<void>
}

export async function startSileroVad(
  stream: MediaStream,
  onSegment: (segment: Blob) => void,
  micVad?: MicVadFactory,
): Promise<SpeechDetector> {
  const factory = micVad ?? (await import('@ricky0123/vad-web')).MicVAD
  const detector = await factory.new({
    baseAssetPath: '/vad/',
    getStream: async () => stream,
    model: 'v5',
    onSpeechEnd: (audio) => onSegment(createSpeechSegmentBlob(audio)),
    onnxWASMBasePath: '/vad/',
    pauseStream: async () => {},
    resumeStream: async () => stream,
    startOnLoad: false,
  })
  await detector.start()

  return { stop: () => detector.destroy() }
}
