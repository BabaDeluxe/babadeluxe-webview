import { ok, err, type Result } from 'neverthrow'
import { v4 as uuidv4 } from 'uuid'
import type { AppDb } from '@/database/app-db'
import type { KeyValueStore } from '@/database/key-value-store'
import type { Conversation, Message } from '@/database/types'
import type { AbstractLogger } from '@/logger'
import { DbError } from '@/errors'
import type { ISyncAdapter, SyncPayload } from './types'
import { SyncError, SyncAuthError } from './types'
import { SyncQueue } from './sync-queue'

const DEVICE_ID_KEY = 'sync.deviceId'

/**
 * SyncManager
 *
 * Plain service (not a Pinia store) that orchestrates all sync activity.
 * useConversationStore calls notifyConversationMutated / notifyConversationDeleted
 * after every successful DB write — no other changes needed in that store.
 *
 * Responsibilities:
 *   1. Generate and persist a stable deviceId per install via KeyValueStore.
 *   2. Lazily assign syncId + syncVersion to conversations that lack them
 *      (supports gradual migration — no blocking batch operation on upgrade).
 *   3. Build SyncPayload snapshots and hand them to the debounced SyncQueue.
 *   4. Apply incoming payloads from pull() back to the local DB using LWW.
 *   5. Coordinate push/pull through the active ISyncAdapter.
 *
 * Concurrency: _busy flag prevents overlapping sync cycles. A second call
 * logs and returns ok() immediately — nothing is lost because the queue persists.
 *
 * Required AppDb additions (see app-db.ts changes in this PR):
 *   - getConversationBySyncId(syncId: string): ResultAsync<SyncableConversation | undefined, DbError>
 *   - deleteMessagesByConversation(conversationId: number): ResultAsync<void, DbError>
 *   - schema version 7: syncId index on conversations + kv object store
 */

/** Augmented Conversation type — only used internally by SyncManager */
export type SyncableConversation = Conversation & {
  syncId?: string
  syncVersion?: number
}

export type SyncManagerConfig = {
  adapter: ISyncAdapter
  /** Debounce window in ms — collapses rapid mutations into one queue entry. Default: 2000 */
  pushDebounceMs?: number
  /** Periodic pull interval in ms. Default: 60 000 */
  pullIntervalMs?: number
}

export class SyncManager {
  private _deviceId: string | undefined
  private _queue: SyncQueue
  private _pullTimer: ReturnType<typeof setInterval> | undefined
  private _busy = false
  private _started = false

  constructor(
    private readonly _db: AppDb,
    private readonly _kv: KeyValueStore,
    private readonly _logger: AbstractLogger,
    private readonly _config: SyncManagerConfig
  ) {
    this._queue = new SyncQueue(_kv, _logger)
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this._started) return
    this._started = true

    this._deviceId = await this._getOrCreateDeviceId()
    this._logger.log('SyncManager: started', {
      adapter: this._config.adapter.name,
      deviceId: this._deviceId,
    })

    // Flush anything that survived a previous crash
    await this._queue.flush(this._config.adapter)

    const pullIntervalMs = this._config.pullIntervalMs ?? 60_000
    this._pullTimer = setInterval(() => void this._periodicPull(), pullIntervalMs)
  }

  stop(): void {
    if (this._pullTimer !== undefined) {
      clearInterval(this._pullTimer)
      this._pullTimer = undefined
    }
    this._started = false
    this._logger.log('SyncManager: stopped')
  }

  // ─── Mutation hooks ───────────────────────────────────────────────────────────

  /**
   * Call after any conversation or message mutation (create / update / delete).
   * Debounced — safe to call on every keystroke.
   */
  async notifyConversationMutated(conversationId: number): Promise<void> {
    if (!this._started || !this._deviceId) return

    const payloadResult = await this._buildPayload(conversationId)
    if (payloadResult.isErr()) {
      this._logger.error('SyncManager: failed to build payload', {
        conversationId,
        error: payloadResult.error,
      })
      return
    }

    this._queue.enqueueDebounced(payloadResult.value, this._config.pushDebounceMs ?? 2_000)
  }

  /**
   * Call after a conversation is deleted.
   * Pushes a tombstone immediately so remote devices know to remove it.
   * Pass the syncId you read from the conversation BEFORE calling deleteConversationWithMessage.
   */
  async notifyConversationDeleted(conversationId: number, syncId: string): Promise<void> {
    if (!this._started || !this._deviceId) return

    const tombstone: SyncPayload = {
      syncId,
      conversation: {
        id: conversationId,
        syncId,
        syncVersion: Date.now(),
        title: '',
        isActive: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      messages: [],
      syncVersion: Date.now(),
      deviceId: this._deviceId,
      deletedAt: new Date().toISOString(),
    }

    await this._queue.enqueue(tombstone)
    await this._queue.flush(this._config.adapter)
  }

  // ─── Manual sync ──────────────────────────────────────────────────────────────

  async syncNow(): Promise<Result<void, SyncError>> {
    if (this._busy) {
      this._logger.log('SyncManager: syncNow skipped — another cycle running')
      return ok(undefined)
    }
    this._busy = true
    try {
      const flushResult = await this._queue.flush(this._config.adapter)
      if (flushResult.isErr()) return flushResult
      return await this._pull()
    } finally {
      this._busy = false
    }
  }

  // ─── Pull ─────────────────────────────────────────────────────────────────────

  private async _periodicPull(): Promise<void> {
    if (this._busy) return
    this._busy = true
    try {
      const result = await this._pull()
      if (result.isErr()) {
        if (result.error instanceof SyncAuthError) {
          this._logger.error('SyncManager: auth error — stopping periodic pull', {
            error: result.error,
          })
          this.stop()
          return
        }
        this._logger.error('SyncManager: periodic pull failed', { error: result.error })
      }
    } finally {
      this._busy = false
    }
  }

  private async _pull(): Promise<Result<void, SyncError>> {
    const pullResult = await this._config.adapter.pull()
    if (pullResult.isErr()) return err(pullResult.error)

    const payloads = pullResult.value
    this._logger.log('SyncManager: pulled payloads', { count: payloads.length })

    for (const payload of payloads) {
      if (payload.deviceId === this._deviceId) continue // skip self-authored echo

      const applyResult = await this._applyPayload(payload)
      if (applyResult.isErr()) {
        this._logger.error('SyncManager: failed to apply payload', {
          syncId: payload.syncId,
          error: applyResult.error,
        })
      }
    }

    return ok(undefined)
  }

  // ─── Payload builder ──────────────────────────────────────────────────────────

  private async _buildPayload(
    conversationId: number
  ): Promise<Result<SyncPayload, DbError | SyncError>> {
    const convResult = await this._db.conversation.get(conversationId)
    if (convResult.isErr()) return err(convResult.error)

    const conv = convResult.value as SyncableConversation | undefined
    if (!conv) return err(new SyncError(`Conversation ${conversationId} not found`))

    // Lazily assign syncId for conversations that pre-date the v7 migration
    let syncId = conv.syncId
    if (!syncId) {
      syncId = uuidv4()
      const upd = await this._db.conversation.update(conversationId, {
        syncId,
        syncVersion: 0,
      } as Partial<Conversation>)
      if (upd.isErr()) return err(upd.error)
    }

    // Bump syncVersion
    const nextVersion = (conv.syncVersion ?? 0) + 1
    const bumpResult = await this._db.conversation.update(conversationId, {
      syncVersion: nextVersion,
    } as Partial<Conversation>)
    if (bumpResult.isErr()) return err(bumpResult.error)

    const msgsResult = await this._db.getMessagesByConversation(conversationId)
    if (msgsResult.isErr()) return err(msgsResult.error)

    return ok({
      syncId: syncId!,
      conversation: { ...conv, syncId, syncVersion: nextVersion },
      messages: [...msgsResult.value],
      syncVersion: nextVersion,
      deviceId: this._deviceId!,
    })
  }

  // ─── Apply incoming payload (LWW) ─────────────────────────────────────────────

  private async _applyPayload(
    payload: SyncPayload
  ): Promise<Result<void, DbError | SyncError>> {
    // Tombstone handling
    if (payload.deletedAt) {
      const existing = await this._findBySyncId(payload.syncId)
      if (existing?.id !== undefined) {
        const del = await this._db.deleteConversationWithMessage(existing.id)
        if (del.isErr()) return err(del.error)
        this._logger.log('SyncManager: applied remote deletion', { syncId: payload.syncId })
      }
      return ok(undefined)
    }

    const existing = await this._findBySyncId(payload.syncId)

    if (!existing) {
      return this._createFromPayload(payload)
    }

    const localVersion = existing.syncVersion ?? 0
    if (localVersion >= payload.syncVersion) {
      this._logger.log('SyncManager: skipping stale remote payload', {
        syncId: payload.syncId,
        local: localVersion,
        remote: payload.syncVersion,
      })
      return ok(undefined)
    }

    return this._updateFromPayload(existing.id, payload)
  }

  private async _createFromPayload(
    payload: SyncPayload
  ): Promise<Result<void, DbError | SyncError>> {
    const addResult = await this._db.conversation.add({
      ...payload.conversation,
      syncVersion: payload.syncVersion,
    } as Conversation)
    if (addResult.isErr()) return err(addResult.error)

    const newId = Number(addResult.value)
    for (const msg of payload.messages) {
      const r = await this._db.createMessage({ ...msg, conversationId: newId })
      if (r.isErr()) {
        this._logger.error('SyncManager: failed to insert message from remote', { error: r.error })
      }
    }

    this._logger.log('SyncManager: created conversation from remote', { syncId: payload.syncId })
    return ok(undefined)
  }

  private async _updateFromPayload(
    localId: number,
    payload: SyncPayload
  ): Promise<Result<void, DbError | SyncError>> {
    const updResult = await this._db.conversation.update(localId, {
      title: payload.conversation.title,
      updatedAt: new Date(payload.conversation.updatedAt),
      syncVersion: payload.syncVersion,
    } as Partial<Conversation>)
    if (updResult.isErr()) return err(updResult.error)

    const delResult = await this._db.deleteMessagesByConversation(localId)
    if (delResult.isErr()) return err(delResult.error)

    for (const msg of payload.messages) {
      const r = await this._db.createMessage({ ...msg, conversationId: localId })
      if (r.isErr()) {
        this._logger.error('SyncManager: failed to re-insert message from remote', { error: r.error })
      }
    }

    this._logger.log('SyncManager: updated conversation from remote', {
      syncId: payload.syncId,
      newVersion: payload.syncVersion,
    })
    return ok(undefined)
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private async _findBySyncId(syncId: string): Promise<SyncableConversation | null> {
    const result = await this._db.getConversationBySyncId(syncId)
    if (result.isErr() || !result.value) return null
    return result.value as SyncableConversation
  }

  private async _getOrCreateDeviceId(): Promise<string> {
    const result = await this._kv.get(DEVICE_ID_KEY)
    if (result.isOk() && result.value) return result.value
    const newId = uuidv4()
    await this._kv.set(DEVICE_ID_KEY, newId)
    return newId
  }
}
