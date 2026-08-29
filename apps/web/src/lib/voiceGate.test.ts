import { describe, expect, it } from 'vitest'

import { createVoiceGate } from './voiceGate'

describe('voice gate', () => {
  it('drops a quiet chunk but preserves a short tail after speech', () => {
    const gate = createVoiceGate({ threshold: 0.01, hangoverMs: 450 })

    gate.observe(new Float32Array([0.001, -0.001]), 100)
    expect(gate.hasSpeech(100)).toBe(false)

    gate.observe(new Float32Array([0.03, -0.02]), 200)
    expect(gate.hasSpeech(500)).toBe(true)
    expect(gate.consume(700)).toBe(true)
    expect(gate.hasSpeech(700)).toBe(false)
  })

  it('consumes the decision once a chunk has been sent', () => {
    const gate = createVoiceGate({ threshold: 0.01, hangoverMs: 450 })
    gate.observe(new Float32Array([0.02]), 100)

    expect(gate.consume(200)).toBe(true)
    expect(gate.consume(200)).toBe(false)
  })
})
