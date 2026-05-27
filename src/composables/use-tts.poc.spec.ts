/**
 * use-tts.poc.spec.ts
 * Vitest unit tests for use-tts — stubs out HuggingFace + WebGPU.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useTts } from './use-tts'

// ─── Mock @huggingface/transformers ───────────────────────────────────────────
const mockTtsPipeline = vi.fn()
vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn().mockResolvedValue(mockTtsPipeline),
}))

// ─── Mock AudioContext ────────────────────────────────────────────────────────
class MockAudioBufferSource {
  buffer: unknown = null
  onended: (() => void) | null = null
  connect = vi.fn()
  start   = vi.fn().mockImplementation(() => { this.onended?.() })
  stop    = vi.fn()
}

class MockAudioContext {
  destination       = {}
  sampleRate        = 24_000
  createBuffer      = vi.fn().mockReturnValue({ copyToChannel: vi.fn() })
  createBufferSource = vi.fn().mockReturnValue(new MockAudioBufferSource())
  close             = vi.fn().mockResolvedValue(undefined)
}

;(globalThis as unknown as Record<string, unknown>).AudioContext = MockAudioContext

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fakeOutput() {
  return { audio: new Float32Array(1024), sampling_rate: 24_000 }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useTts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset singleton between tests by clearing module cache isn't feasible in
    // Vitest without resetModules; we reset the mock return value instead.
    mockTtsPipeline.mockResolvedValue(fakeOutput())
  })

  it('returns status idle initially', () => {
    const { status } = useTts()
    expect(status.value).toBe('idle')
  })

  it('resolves ok() when speak succeeds', async () => {
    // Force WASM path (no navigator.gpu in Node)
    const { speak, status } = useTts()
    const result = await speak('Hello world')

    expect(result.isOk()).toBe(true)
    expect(status.value).toBe('idle')
  })

  it('returns err() when inference throws', async () => {
    mockTtsPipeline.mockRejectedValueOnce(new Error('OOM'))

    const { speak, error } = useTts()
    const result = await speak('crash me')

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.code).toBe('SPEAK_FAILED')
    }
    expect(error.value?.code).toBe('SPEAK_FAILED')
  })

  it('stop() resets status to idle', async () => {
    const { speak, stop, status } = useTts()
    // start speaking but immediately stop
    const promise = speak('long text')
    stop()
    await promise
    expect(status.value).toBe('idle')
  })

  it('backend is wasm when no navigator.gpu', async () => {
    const { speak, backend } = useTts()
    await speak('test')
    // Node has no navigator.gpu → WASM path
    expect(backend.value).toBe('wasm')
  })
})
