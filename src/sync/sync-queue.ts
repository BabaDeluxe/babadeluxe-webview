/* eslint-disable @typescript-eslint/naming-convention */
import { ok, err, type Result } from 'neverthrow'
import type { KeyValueStore } from '@/database/key-value-store'
import type { AbstractLogger } from '@/logger'
import type { ISyncAdapter, SyncPayload } from './types'
import { SyncError, SyncAuthError } from './types'
import { retryWithBackoff } from '@/retry'

const QUEUE_KV_KEY = 'sync.queue'

type QueueEntry = {
  payload: SyncPayload
  enqueuedAt: string
  retries: number
}

/**
 * SyncQueue — crash-safe, deduplicated outbox.
 *
 * Backed by KeyValueStore (same Dexie 'kv' store used elsewhere).
 * Serialises to JSON after every enqueue and every successful flush.
 *
 * Deduplication: Map<syncId, QueueEntry> — enqueueing the same conversation
 * twice collapses to one entry with the latest payload (LWW within the queue).
 * Regardless of mutation frequency the queue stays O(1) per conversation.
 *
 * Retry: flush() delegates to retryWithBackoff from src/retry.ts.
 * SyncAuthError is detected and surfaced immediately — never retried.
 */
export class SyncQueue {
  private _entries = new Map<string, QueueEntry>()
  private _loaded = false
  private _debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private readonly _kv: KeyValueStore,
    private readonly _logger: AbstractLogger
  ) {}

  // ─── Public API ──────────────────────────────────────────────────────────────

  async enqueue(payload: SyncPayload): Promise<void> {
    await this._ensureLoaded()
    this._entries.set(payload.syncId, {
      payload,
      enqueuedAt: new Date().toISOString(),
      retries: 0,
    })
    await this._persist()
    this._logger.log('SyncQueue: enqueued', { syncId: payload.syncId, size: this._entries.size })
  }

  /**
   * Debounced enqueue — collapses rapid mutations within delayMs into one entry.
   * Call on every UI save; the queue grows by at most one entry per conversation
   * per debounce window. Returns a cancel function.
   */
  enqueueDebounced(payload: SyncPayload, delayMs = 2000): () => void {
    const existing = this._debounceTimers.get(payload.syncId)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      this._debounceTimers.delete(payload.syncId)
      void this.enqueue(payload)
    }, delayMs)

    this._debounceTimers.set(payload.syncId, timer)
    return () => {
      clearTimeout(timer)
      this._debounceTimers.delete(payload.syncId)
    }
  }

  get size(): number {
    return this._entries.size
  }

  /**
   * Flush all queued entries through the given adapter.
   * Stops immediately on SyncAuthError (non-retryable).
   * Uses retryWithBackoff (src/retry.ts) for transient errors.
   */
  async flush(adapter: ISyncAdapter): Promise<Result<void, SyncError>> {
    await this._ensureLoaded()

    if (this._entries.size === 0) return ok(undefined)
    if (!adapter.isAvailable()) {
      this._logger.log('SyncQueue: flush skipped — adapter unavailable', { adapter: adapter.name })
      return ok(undefined)
    }

    const payloads = [...this._entries.values()].map((e) => e.payload)

    const result = await retryWithBackoff(
      () => adapter.push(payloads),
      `SyncQueue.flush[${adapter.name}]`,
      {
        maxRetries: 4,
        initialDelayMilliseconds: 1500,
        backoffMultiplier: 2,
        maxDelayMilliseconds: 30_000,
        logger: this._logger,
      }
    )

    if (result.isErr()) {
      if (result.error instanceof SyncAuthError) {
        this._logger.error('SyncQueue: auth error — sync disabled until reconfigured', {
          adapter: adapter.name,
        })
        return err(result.error)
      }
      this._logger.error('SyncQueue: flush failed after retries', { adapter: adapter.name })
      return err(
        result.error instanceof SyncError ? result.error : new SyncError(String(result.error))
      )
    }

    this._entries.clear()
    await this._persist()
    this._logger.log('SyncQueue: flush complete', { adapter: adapter.name, count: payloads.length })
    return ok(undefined)
  }

  // ─── Persistence ──────────────────────────────────────────────────────────────

  private async _ensureLoaded(): Promise<void> {
    if (this._loaded) return
    this._loaded = true

    const result = await this._kv.get(QUEUE_KV_KEY)
    if (result.isErr() || !result.value) return

    try {
      const raw = JSON.parse(result.value) as Array<[string, QueueEntry]>
      this._entries = new Map(raw)
      this._logger.log('SyncQueue: restored from storage', { size: this._entries.size })
    } catch (e) {
      this._logger.error('SyncQueue: corrupt queue — starting fresh', { error: e })
      this._entries = new Map()
    }
  }

  private async _persist(): Promise<void> {
    const serialized = JSON.stringify([...this._entries.entries()])
    const result = await this._kv.set(QUEUE_KV_KEY, serialized)
    if (result.isErr()) {
      this._logger.error('SyncQueue: failed to persist queue', { error: result.error })
    }
  }
}
