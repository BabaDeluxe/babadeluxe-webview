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

/**
 * High-level service interface for the Sync Store.
 */
export type ISyncAdapter = {
  readonly name: string
  push(payload: SyncPayload): Promise<Result<void, SyncError>>
  pull(): Promise<Result<SyncPayload[], SyncError>>
  testConnection(): Promise<Result<void, SyncError>>
}

/**
 * Simplified Got-like interface for backend drivers.
 * Provides consistency while allowing the use of 'got' or its polyfills.
 */
export interface GotResponse<T = unknown> {
  body: T
  statusCode: number
  headers: Record<string, string | string[] | undefined>
  rawBody: Buffer | string
}

export interface GotOptions {
  headers?: Record<string, string | undefined>
  json?: unknown
  body?: string | Buffer
  method?: string
  searchParams?: Record<string, string | number | undefined>
  throwHttpErrors?: boolean
  responseType?: 'json' | 'text' | 'buffer'
}

export interface GotInstance {
  (url: string, options?: GotOptions): Promise<GotResponse>
  get: <T = unknown>(url: string, options?: GotOptions) => Promise<GotResponse<T>>
  put: <T = unknown>(url: string, options?: GotOptions) => Promise<GotResponse<T>>
  post: <T = unknown>(url: string, options?: GotOptions) => Promise<GotResponse<T>>
  patch: <T = unknown>(url: string, options?: GotOptions) => Promise<GotResponse<T>>
  head: (url: string, options?: GotOptions) => Promise<GotResponse<void>>
  delete: <T = unknown>(url: string, options?: GotOptions) => Promise<GotResponse<T>>
  extend: (options: GotOptions) => GotInstance
}

/**
 * Backend-specific driver interface.
 * Implements the raw transport logic for a specific service using 'got'.
 */
export interface ISyncBackendDriver {
  readonly name: string
  testConnection(): Promise<Result<void, SyncError>>
  getGot(): GotInstance
  putFile(shardUrl: string, path: string, content: string): Promise<void>
  getFile(shardUrl: string, path: string): Promise<string | null>
  isShardFull(shardUrl?: string): Promise<boolean>
  createNewShardFolder(index: number): Promise<string>
  getRootUrl(): string
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
