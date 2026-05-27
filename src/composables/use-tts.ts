/**
 * use-tts.ts — PoC: Kokoro-82M TTS with WebGPU auto-detection
 *
 * Strategy:
 *   1. Probe navigator.gpu  → request adapter to confirm a real GPU exists
 *   2. If GPU confirmed  → load model with device:'webgpu', dtype:'q8f16'
 *   3. If no GPU / WebGPU unsupported → fallback to device:'wasm', dtype:'q8'
 *   4. Pipeline is lazily initialised on first speak() call and cached
 *   5. speak() returns a Promise<void> that resolves when audio finishes playing
 *
 * Model: onnx-community/Kokoro-82M-v1.0 (HuggingFace)
 * Weights: ~86 MB (webgpu q8f16) or ~92 MB (wasm q8)
 *
 * Usage:
 *   const { speak, stop, status, backend, gpuInfo } = useTts()
 *   await speak('Hello world', { voice: 'af_heart', speed: 1.0 })
 */

import { ref, readonly, shallowRef } from 'vue'
import { ok, err, type Result } from 'neverthrow'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TtsBackend = 'webgpu' | 'wasm' | 'undetected'

export type TtsStatus =
  | 'idle'
  | 'detecting'
  | 'loading'
  | 'speaking'
  | 'stopping'
  | 'error'

export interface GpuInfo {
  vendor: string
  architecture: string
  device: string
  description: string
}

export interface SpeakOptions {
  /** Kokoro voice id.  Default: 'af_heart' */
  voice?: string
  /** Speed multiplier 0.5–2.0.  Default: 1.0 */
  speed?: number
}

export interface TtsError {
  code: 'INIT_FAILED' | 'SPEAK_FAILED' | 'NO_AUDIO_CONTEXT'
  message: string
  cause?: unknown
}

// ─── HuggingFace transformers.js dynamic import helpers ───────────────────────
//
// We import lazily so the ~500 kB @huggingface/transformers bundle is only
// fetched when TTS is actually used (tree-shaking friendly).

type HFPipeline = (text: string, options: Record<string, unknown>) => Promise<{
  audio: Float32Array
  sampling_rate: number
}>

interface HFModule {
  pipeline: (
    task: string,
    model: string,
    options: Record<string, unknown>,
  ) => Promise<HFPipeline>
}

async function loadHF(): Promise<HFModule> {
  // Dynamic import — bundler will code-split this automatically
  return import('@huggingface/transformers') as unknown as Promise<HFModule>
}

// ─── GPU detection ────────────────────────────────────────────────────────────

async function detectGpu(): Promise<{ backend: TtsBackend; gpuInfo: GpuInfo | null }> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    return { backend: 'wasm', gpuInfo: null }
  }

  try {
    // requestAdapter() returns null when no compatible GPU is available
    const adapter = await (navigator as unknown as { gpu: GPU }).gpu.requestAdapter({
      powerPreference: 'high-performance',
    })

    if (!adapter) {
      return { backend: 'wasm', gpuInfo: null }
    }

    const info = await adapter.requestAdapterInfo()

    const gpuInfo: GpuInfo = {
      vendor:       info.vendor       ?? 'unknown',
      architecture: info.architecture ?? 'unknown',
      device:       info.device       ?? 'unknown',
      description:  info.description  ?? 'unknown',
    }

    return { backend: 'webgpu', gpuInfo }
  }
  catch {
    // WebGPU exists but adapter request failed (e.g. headless, sandboxed)
    return { backend: 'wasm', gpuInfo: null }
  }
}

// ─── Module-level singleton (shared across all composable instances) ──────────

let _pipelinePromise: Promise<HFPipeline> | null = null
let _resolvedBackend: TtsBackend = 'undetected'
let _resolvedGpuInfo: GpuInfo | null = null

/**
 * Initialise the TTS pipeline once and cache the Promise.
 * Subsequent calls return the same Promise regardless of how many
 * components call useTts().
 */
async function getOrInitPipeline(
  onStatus: (s: TtsStatus) => void,
): Promise<Result<HFPipeline, TtsError>> {
  if (_pipelinePromise) {
    try {
      return ok(await _pipelinePromise)
    }
    catch (cause) {
      return err({ code: 'INIT_FAILED', message: 'Pipeline previously failed to load', cause })
    }
  }

  onStatus('detecting')
  const { backend, gpuInfo } = await detectGpu()
  _resolvedBackend = backend
  _resolvedGpuInfo = gpuInfo

  onStatus('loading')

  _pipelinePromise = (async () => {
    const hf = await loadHF()

    const device = backend === 'webgpu' ? 'webgpu' : 'wasm'
    // q8f16: mixed int8/fp16 — optimal for WebGPU (smallest GPU variant, 86 MB)
    // q8:    int8 quantised  — optimal for WASM/CPU (92 MB)
    const dtype  = backend === 'webgpu' ? 'q8f16'  : 'q8'

    return hf.pipeline('text-to-speech', 'onnx-community/Kokoro-82M-v1.0', {
      device,
      dtype,
    })
  })()

  try {
    return ok(await _pipelinePromise)
  }
  catch (cause) {
    _pipelinePromise = null // allow retry on next call
    return err({
      code:    'INIT_FAILED',
      message: `Failed to load Kokoro-82M on ${backend}`,
      cause,
    })
  }
}

// ─── Composable ───────────────────────────────────────────────────────────────

export function useTts() {
  const status  = ref<TtsStatus>('idle')
  const backend = ref<TtsBackend>('undetected')
  const gpuInfo = ref<GpuInfo | null>(null)
  const error   = ref<TtsError | null>(null)

  // We hold a reference to the currently playing AudioBufferSourceNode
  // so stop() can immediately cut playback.
  const _sourceNode = shallowRef<AudioBufferSourceNode | null>(null)
  let   _audioCtx:   AudioContext | null = null

  function _setStatus(s: TtsStatus) {
    status.value  = s
    backend.value = _resolvedBackend
    gpuInfo.value = _resolvedGpuInfo
  }

  /**
   * Speak a text string.
   *
   * @returns A neverthrow Result that resolves when audio finishes,
   *          or rejects with a TtsError.
   */
  async function speak(
    text: string,
    options: SpeakOptions = {},
  ): Promise<Result<void, TtsError>> {
    const { voice = 'af_heart', speed = 1.0 } = options

    // ── Stop any currently playing audio ────────────────────────────────────
    stop()
    error.value = null

    // ── Ensure AudioContext exists ───────────────────────────────────────────
    if (!_audioCtx) {
      try {
        _audioCtx = new AudioContext()
      }
      catch (cause) {
        const e: TtsError = {
          code:    'NO_AUDIO_CONTEXT',
          message: 'Could not create AudioContext — check browser permissions',
          cause,
        }
        error.value = e
        status.value = 'error'
        return err(e)
      }
    }

    // ── Get / init pipeline ──────────────────────────────────────────────────
    const pipelineResult = await getOrInitPipeline(_setStatus)

    if (pipelineResult.isErr()) {
      error.value  = pipelineResult.error
      status.value = 'error'
      return err(pipelineResult.error)
    }

    const tts = pipelineResult.value

    // ── Run inference ────────────────────────────────────────────────────────
    let output: { audio: Float32Array; sampling_rate: number }
    try {
      _setStatus('speaking')  // update backend/gpuInfo refs
      status.value = 'speaking'

      output = await tts(text, { voice, speed })
    }
    catch (cause) {
      const e: TtsError = {
        code:    'SPEAK_FAILED',
        message: 'Kokoro inference failed',
        cause,
      }
      error.value  = e
      status.value = 'error'
      return err(e)
    }

    // ── Decode PCM → AudioBuffer → play ─────────────────────────────────────
    return new Promise<Result<void, TtsError>>((resolve) => {
      const { audio, sampling_rate } = output
      const audioCtx   = _audioCtx!
      const buffer     = audioCtx.createBuffer(1, audio.length, sampling_rate)
      buffer.copyToChannel(audio, 0)

      const source = audioCtx.createBufferSource()
      source.buffer = buffer
      source.connect(audioCtx.destination)

      _sourceNode.value = source

      source.onended = () => {
        _sourceNode.value = null
        status.value      = 'idle'
        resolve(ok(undefined))
      }

      source.start()
    })
  }

  /**
   * Immediately stop any playing audio.
   */
  function stop() {
    if (_sourceNode.value) {
      status.value = 'stopping'
      try {
        _sourceNode.value.stop()
      }
      catch {
        // already stopped
      }
      _sourceNode.value = null
      status.value      = 'idle'
    }
  }

  /**
   * Dispose the AudioContext.  Call this in onUnmounted if the
   * composable is used in a long-lived component that may be destroyed.
   */
  async function dispose() {
    stop()
    await _audioCtx?.close()
    _audioCtx = null
  }

  return {
    // State (readonly to enforce encapsulation)
    status:  readonly(status),
    backend: readonly(backend),
    gpuInfo: readonly(gpuInfo),
    error:   readonly(error),

    // Actions
    speak,
    stop,
    dispose,
  }
}
