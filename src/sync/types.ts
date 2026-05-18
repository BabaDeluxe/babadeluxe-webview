import type { Result } from 'neverthrow'
import type { Conversation, Message } from '@/database/types'

// ─── Domain errors ────────────────────────────────────────────────────────────

export class SyncError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'SyncError'
    if (cause instanceof Error) this.cause = cause
  }
}

/**
 * Auth errors (401 / 403 non-rate-limit) are non-retryable.
 * SyncQueue.flush() detects this subclass and surfaces immediately
 * instead of burning retry attempts.
 */
export class SyncAuthError extends SyncError {
  constructor(message: string, cause?: unknown) {
    super(message, cause)
    this.name = 'SyncAuthError'
  }
}

// ─── Wire types ───────────────────────────────────────────────────────────────

/**
 * One SyncPayload = one conversation snapshot that travels over the wire.
 *
 * syncId        — stable UUID that identifies the conversation across devices/deletions.
 *                 Lazily assigned by SyncManager on first mutation after v7 migration.
 * syncVersion   — monotonically increasing counter bumped by SyncManager on every
 *                 local mutation. Used for LWW conflict resolution (never use timestamps).
 * deviceId      — UUID persisted per-install in KeyValueStore. Used to detect
 *                 self-authored payloads during pull and skip echo-back overwrites.
 * deletedAt     — ISO-8601 string present only on tombstone payloads.
 */
export type SyncPayload = {
  syncId: string
  conversation: Conversation & { syncId: string; syncVersion: number }
  messages: Message[]
  syncVersion: number
  deviceId: string
  deletedAt?: string
}

// ─── Adapter interface ────────────────────────────────────────────────────────

export interface ISyncAdapter {
  readonly name: string
  isAvailable(): boolean
  push(payloads: SyncPayload[]): Promise<Result<void, SyncError>>
  pull(): Promise<Result<SyncPayload[], SyncError>>
}
