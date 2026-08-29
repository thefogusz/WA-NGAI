import { createSpeechSegmentBlob } from './speechSegment'

type MicVadFactory = Pick<typeof import('@ricky0123/vad-web').MicVAD, 'new'>

export type SpeechDetector = {
  stop: () => Promise<void>
}

export type VadProfile = 'game' | 'discord' | 'video'

const vadProfileOptions: Record<VadProfile, {
  positiveSpeechThreshold: number
  negativeSpeechThreshold: number
  redemptionMs: number
  minSpeechMs: number
}> = {
  game: { positiveSpeechThreshold: 0.5, negativeSpeechThreshold: 0.35, redemptionMs: 700, minSpeechMs: 180 },
  discord: { positiveSpeechThreshold: 0.38, negativeSpeechThreshold: 0.25, redemptionMs: 500, minSpeechMs: 120 },
  video: { positiveSpeechThreshold: 0.52, negativeSpeechThreshold: 0.35, redemptionMs: 850, minSpeechMs: 220 },
}

export async function startSileroVad(
  stream: MediaStream,
  onSegment: (segment: Blob) => void,
  micVad?: MicVadFactory,
  profile: VadProfile = 'game',
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
    ...vadProfileOptions[profile],
  })
  await detector.start()

  return { stop: () => detector.destroy() }
}
