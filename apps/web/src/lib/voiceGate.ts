type VoiceGateOptions = {
  hangoverMs: number
  threshold: number
}

export function createVoiceGate({ threshold, hangoverMs }: VoiceGateOptions) {
  let lastSpeechAt = Number.NEGATIVE_INFINITY
  let pendingSpeech = false

  return {
    observe(samples: Float32Array, now: number) {
      let sum = 0
      for (const sample of samples) sum += sample * sample
      const rms = Math.sqrt(sum / Math.max(samples.length, 1))
      if (rms >= threshold) {
        lastSpeechAt = now
        pendingSpeech = true
      }
    },
    hasSpeech(now: number) {
      return pendingSpeech || now - lastSpeechAt <= hangoverMs
    },
    consume(now: number) {
      if (!this.hasSpeech(now)) return false
      lastSpeechAt = Number.NEGATIVE_INFINITY
      pendingSpeech = false
      return true
    },
  }
}
