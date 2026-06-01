import { type Result } from 'neverthrow'
import { type SyncError } from '@/errors'
import type { Conversation, Message } from '@/database/chat-repository'

export type SyncBackend = 'none' | 'github' | 'gitlab' | 'codeberg' | 'webdav' | 'azure-devops'

export interface SyncPayload {
  syncId: string
  conversation: Conversation
  messages: Message[]
  syncVersion: number
  deviceId: string
  deletedAt?: string
}

export interface ConversationSnapshot {
  id: string | number
  syncVersion: number
  conversation: Conversation
  messages: Message[]
  deviceId?: string
}

export type ConversationSnapshotForUpload = ConversationSnapshot

export interface SyncConfig {
  backend: SyncBackend
  token?: string
  owner?: string
  repo?: string
  url?: string
  username?: string
  password?: string
  projectId?: string
  org?: string
  project?: string
  pat?: string
  apiBase?: string
  branch?: string
}

export type GitHubConfig = Pick<SyncConfig, 'token' | 'owner' | 'repo' | 'branch'>
export type GitLabConfig = Pick<SyncConfig, 'token' | 'projectId' | 'apiBase'>
export type CodebergConfig = Pick<SyncConfig, 'token' | 'repo'>
export type WebDavConfig = Pick<SyncConfig, 'url' | 'username' | 'password'>
export type AzureDevOpsConfig = Pick<SyncConfig, 'org' | 'project' | 'repo' | 'pat' | 'apiBase'>

export interface ISyncAdapter {
  readonly name: string
  testConnection(): Promise<Result<void, SyncError>>
  push(payload: SyncPayload): Promise<Result<void, SyncError>>
  pull(): Promise<Result<SyncPayload[], SyncError>>
}

export interface ISyncBackendDriver {
  readonly name: string
  testConnection(): Promise<Result<void, SyncError>>
  getRootUrl(): string
  putFile(shardUrl: string, path: string, content: string): Promise<void>
  getFile(shardUrl: string, path: string): Promise<string | null>
  isShardFull(shardUrl: string): Promise<boolean>
  createNewShardFolder(index: number): Promise<string>
}

// Fetch abstraction for shard-utils
export interface FetchResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
  text(): Promise<string>
  headers: { get(name: string): string | null }
}

export type FetchFn = (url: string, init?: unknown) => Promise<FetchResponse>

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'success' | 'error' | 'conflict'
  lastSyncAt?: Date
  error?: SyncError
  info?: ConflictInfo
}

export interface ConflictInfo {
  conversationId: number
  localPayload: SyncPayload
  remotePayload: SyncPayload
}
