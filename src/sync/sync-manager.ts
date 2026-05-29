import { ok, err, type Result } from 'neverthrow'
import { v4 as uuidv4 } from 'uuid'
import { useTimeoutFn } from '@vueuse/core'
import type { AppDb } from '@/database/app-db'
import type { Conversation, Message } from '@/database/types'
import { SyncError as AppSyncError } from '@/errors'
import type { ISyncAdapter, SyncPayload, SyncStatus, ConflictInfo } from '@/sync/types'
import type { AbstractLogger } from '@/logger'

type StatusHandler = (status: SyncStatus) => void
type ConflictHandler = (info: ConflictInfo) => void

type DbMessage = {
  id?: number
  conversationId: number
  role: Message['role']
  timestamp: Date
  content: string
  isStreaming?: boolean
  model?: string
  systemPrompt?: string
  contextReferences?: string
}

type PendingTimer = ReturnType<typeof useTimeoutFn>

const flushDebounceMs = 2000

export class SyncManager {
  private _adapter: ISyncAdapter | null = null
  private _statusHandlers: StatusHandler[] = []
  private _conflictHandlers: ConflictHandler[] = []
  private _pending = new Map<number, PendingTimer>()

  constructor(
    private readonly _db: AppDb,
    private readonly _logger: AbstractLogger,
    private readonly _deviceId: string
  ) {}

  setAdapter(adapter: ISyncAdapter | null): void {
    this._adapter = adapter
  }

  onStatusChange(handler: StatusHandler): void {
    this._statusHandlers.push(handler)
  }

  onConflict(handler: ConflictHandler): void {
    this._conflictHandlers.push(handler)
  }

  notifyChanged(conversationId: number): void {
    const existing = this._pending.get(conversationId)
    if (existing) {
      existing.stop()
      existing.start()
      return
    }

    const timer = useTimeoutFn(
      () => {
        this._pending.delete(conversationId)
        void this._pushOne(conversationId)
      },
      flushDebounceMs,
      { immediate: false }
    )

    this._pending.set(conversationId, timer)
    timer.start()
  }

  notifyDeleted(conversationId: number, syncVersion: number): void {
    const existing = this._pending.get(conversationId)
    if (existing) {
      existing.stop()
      this._pending.delete(conversationId)
    }
    void this._pushTombstone(conversationId, syncVersion)
  }

  async syncNow(): Promise<void> {
    const pendingIds: number[] = []

    for (const [id, timer] of this._pending) {
      if (timer.isPending.value) {
        timer.stop()
        pendingIds.push(id)
      }
    }
    this._pending.clear()

    // Flush all pending pushes before pulling to avoid overwriting local changes
    await Promise.all(pendingIds.map((id) => this._pushOne(id)))
    await this.pullAll()
  }

  async pullAll(): Promise<void> {
    if (!this._adapter) return

    this._emit({ state: 'syncing' })

    const pullResult = await this._adapter.pull()
    if (pullResult.isErr()) {
      this._emit({ state: 'error', error: pullResult.error })
      return
    }

    for (const payload of pullResult.value) {
      if (payload.deviceId === this._deviceId) continue
      await this._applyPayload(payload)
    }

    this._emit({ state: 'success', lastSyncAt: new Date() })
  }

  async resolveConflict(
    info: ConflictInfo,
    resolution: 'local-wins' | 'remote-wins'
  ): Promise<void> {
    if (!this._adapter) return

    if (resolution === 'local-wins') {
      const result = await this._adapter.push(info.localPayload)
      if (result.isErr()) {
        this._emit({ state: 'error', error: result.error })
        return
      }
    } else {
      await this._applyPayload(info.remotePayload)
    }

    this._emit({ state: 'success', lastSyncAt: new Date() })
  }

  private async _pushOne(conversationId: number): Promise<void> {
    if (!this._adapter) return

    const payloadResult = await this._buildPayload(conversationId)
    if (payloadResult.isErr()) {
      this._logger.error('SyncManager: failed to build payload', {
        conversationId,
        error: payloadResult.error,
      })
      return
    }

    const pushResult = await this._adapter.push(payloadResult.value)
    if (pushResult.isErr()) {
      this._logger.error('SyncManager: push failed', {
        conversationId,
        error: pushResult.error,
      })
      this._emit({ state: 'error', error: pushResult.error })
    }
  }

  private async _pushTombstone(conversationId: number, syncVersion: number): Promise<void> {
    if (!this._adapter) return

    const tombstone: SyncPayload = {
      syncId: `tombstone:${conversationId}`,
      conversation: {
        id: conversationId,
        title: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: 0,
        syncId: `tombstone:${conversationId}`,
        syncVersion: Number.MAX_SAFE_INTEGER,
      },
      messages: [],
      syncVersion: Number.MAX_SAFE_INTEGER,
      deviceId: this._deviceId,
      deletedAt: new Date().toISOString(),
    }

    const result = await this._adapter.push(tombstone)
    if (result.isErr()) {
      this._logger.error('SyncManager: tombstone push failed', {
        conversationId,
        syncVersion,
        error: result.error,
      })
    }
  }

  private async _applyPayload(payload: SyncPayload): Promise<void> {
    if (payload.deletedAt) {
      const existingResult = await this._db.conversation.get(payload.conversation.id)
      if (existingResult.isOk() && existingResult.value) {
        await this._db.conversation.delete(payload.conversation.id)
        const msgResult = await this._db.message
          .where('conversationId')
          .equals(payload.conversation.id)
          .toArray()
        if (msgResult.isOk()) {
          const ids = msgResult.value.map((m) => m.id!).filter(Boolean)
          if (ids.length > 0) await this._db.message.bulkDelete(ids)
        }
      }
      return
    }

    const localResult = await this._db.conversation.get(payload.conversation.id)
    if (localResult.isErr()) return
    const local = localResult.value

    if (local && this._pending.has(payload.conversation.id)) {
      const localPayloadResult = await this._buildPayload(payload.conversation.id)
      if (localPayloadResult.isOk()) {
        const info: ConflictInfo = {
          conversationId: payload.conversation.id,
          localPayload: localPayloadResult.value,
          remotePayload: payload,
        }
        this._conflictHandlers.forEach((h) => {
          h(info)
        })
        this._emit({ state: 'conflict', info })
        return
      }
    }

    if (local?.syncVersion !== undefined && payload.syncVersion <= local.syncVersion) {
      return
    }

    const conv: Conversation = {
      id: payload.conversation.id,
      title: payload.conversation.title,
      isActive: payload.conversation.isActive,
      createdAt: new Date(payload.conversation.createdAt),
      updatedAt: new Date(payload.conversation.updatedAt),
      syncId: payload.conversation.syncId,
      syncVersion: payload.conversation.syncVersion,
    }
    await this._db.conversation.put(conv)

    const existingMsgResult = await this._db.message
      .where('conversationId')
      .equals(payload.conversation.id)
      .toArray()

    if (existingMsgResult.isOk() && existingMsgResult.value.length > 0) {
      const ids = existingMsgResult.value.map((m) => m.id!).filter(Boolean)
      await this._db.message.bulkDelete(ids)
    }

    if (payload.messages.length > 0) {
      const rows: DbMessage[] = payload.messages.map((m: Message) => ({
        id: m.id,
        conversationId: m.conversationId,
        role: m.role,
        timestamp: m.timestamp instanceof Date ? m.timestamp : new Date(String(m.timestamp)),
        content: m.content,
        model: m.model,
        systemPrompt: m.systemPrompt,
        contextReferences: m.contextReferences ? JSON.stringify(m.contextReferences) : undefined,
      }))
      await this._db.message.bulkPut(rows)
    }
  }

  private async _buildPayload(conversationId: number): Promise<Result<SyncPayload, AppSyncError>> {
    const convResult = await this._db.conversation.get(conversationId)
    if (convResult.isErr()) {
      return err(
        new AppSyncError('local', `Failed to read conversation ${conversationId}`, convResult.error)
      )
    }

    const conv = convResult.value
    if (!conv) {
      return err(new AppSyncError('local', `Conversation ${conversationId} not found`))
    }

    const syncId = conv.syncId ?? uuidv4()
    const syncVersion = (conv.syncVersion ?? 0) + 1

    // Always persist the new syncVersion so subsequent pushes increment correctly
    await this._db.conversation.update(conversationId, { syncId, syncVersion })

    const msgResult = await this._db.message
      .where('conversationId')
      .equals(conversationId)
      .toArray()

    if (msgResult.isErr()) {
      return err(
        new AppSyncError(
          'local',
          `Failed to read messages for conversation ${conversationId}`,
          msgResult.error
        )
      )
    }

    const payload: SyncPayload = {
      syncId,
      conversation: { ...conv, syncId, syncVersion },
      messages: msgResult.value.map((m) => ({
        id: m.id!,
        conversationId: m.conversationId,
        role: m.role,
        timestamp: m.timestamp,
        content: m.content,
        model: m.model,
        systemPrompt: m.systemPrompt,
        contextReferences: m.contextReferences ? JSON.parse(m.contextReferences) : undefined,
      })),
      syncVersion,
      deviceId: this._deviceId,
    }

    return ok(payload)
  }

  private _emit(status: SyncStatus): void {
    this._statusHandlers.forEach((h) => {
      h(status)
    })
  }
}
