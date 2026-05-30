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
  testConnection(): Promise<Result<void, SyncError>>
}

export type SyncBackend = 'github' | 'webdav' | 'gitlab' | 'azure-devops' | 'sftp' | 'none'

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

export interface ShardEntry {
  index: number
  url: string
  readOnly: boolean
}

export interface ShardMap {
  n: number
  shards: ShardEntry[]
}

export interface MetadataEntry {
  path: string
  sha256: string
  ts: number
  parts?: string[]
  totalBytes?: number
  partSize?: number
}

export interface SyncMetadata {
  keys: Record<string, MetadataEntry>
}

export interface FetchResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
  text: () => Promise<string>
  headers: { get: (name: string) => string | null }
}

export type FetchFn = (url: string, options?: RequestInit) => Promise<FetchResponse>

export type GitHubConfig = {
  token: string
  owner: string
  repo: string
  branch?: string
}

export type WebDavConfig = {
  url: string
  username: string
  password: string
}

export type GitLabConfig = {
  token: string
  projectId: string
  apiBase?: string
}

export type AzureDevOpsConfig = {
  org: string
  project: string
  repo: string
  pat: string
  apiBase?: string
}

export type SyncConfig =
  | ({ backend: 'github' } & GitHubConfig)
  | ({ backend: 'webdav' } & WebDavConfig)
  | ({ backend: 'gitlab' } & GitLabConfig)
  | ({ backend: 'azure-devops' } & AzureDevOpsConfig)
  | { backend: 'sftp'; host: string; port: number; username: string; privateKey: string }
