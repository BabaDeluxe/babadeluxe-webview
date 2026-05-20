import type { Conversation, Message } from '@/database/types'
import type { Result } from 'neverthrow'
import type { SyncError } from '@/errors'

export type SyncPayload = {
  syncId: string
  conversation: Conversation & { syncId: string; syncVersion: number }
  messages: Message[]
  syncVersion: number
  deviceId: string
  deletedAt?: string
}

export type ConversationSnapshot = {
  id: number
  syncVersion: number
  deviceId?: string
  conversation: Conversation
  messages: Message[]
}

export type ConversationSnapshotForUpload = ConversationSnapshot & {
  deviceId: string
}

export type ISyncAdapter = {
  readonly name: string
  push(payload: SyncPayload): Promise<Result<void, SyncError>>
  pull(since?: string): Promise<Result<SyncPayload[], SyncError>>
}

export type SyncBackend = 'github' | 'webdav' | 'sftp' | 'none'

export type ConflictInfo = {
  conversationId: number
  localPayload: SyncPayload
  remotePayload: SyncPayload
}

export type SyncStatus =
  | { state: 'idle' }
  | { state: 'syncing' }
  | { state: 'success'; lastSyncAt: Date }
  | { state: 'conflict'; info: ConflictInfo }
  | { state: 'error'; error: SyncError }
