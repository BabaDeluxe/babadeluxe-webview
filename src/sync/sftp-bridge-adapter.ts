import { ok, err, type Result, ResultAsync } from 'neverthrow'
import { SyncError, SyncAuthError } from '@/errors'
import type { ISyncAdapter, SyncPayload, ConversationSnapshot, ConversationSnapshotForUpload } from '@/sync/types'
import type { DeviceIdService } from '@/sync/device-id'
import { VsCodeBridge } from '@/services/vs-code-bridge'

// ─── Message contract (webview → extension host) ────────────────────────────

export type SftpRequest =
  | { type: 'sync:sftp:push'; requestId: string; path: string; content: string }
  | { type: 'sync:sftp:pull'; requestId: string; dirPath: string }
  | { type: 'sync:sftp:delete'; requestId: string; path: string }
  | { type: 'sync:sftp:test'; requestId: string }

export type SftpResponse = {
  requestId: string
  error?: string
  // pull response
  files?: Array<{ path: string; content: string }>
  // test/push/delete: just error presence signals failure
}

export type SftpAdapterConfig = {
  host: string
  port: number
  username: string
  /** Stored in VS Code SecretStorage — never in app-db */
  privateKeyOrPassword: string
  remotePath: string
}

const FILE_PREFIX = 'chats/'
const FILE_EXTENSION = '.json'

/**
 * Thin postMessage shim — delegates all SFTP I/O to the VS Code extension host
 * via VsCodeBridge. The actual ssh2-sftp-client calls live in sftp-host-service.ts.
 *
 * Only available when running inside VS Code. Gracefully returns SyncError when
 * the VS Code API is not present.
 */
export class SftpBridgeAdapter implements ISyncAdapter {
  readonly name = 'sftp'
  private readonly _bridge = VsCodeBridge.getInstance()

  constructor(
    private readonly _config: SftpAdapterConfig,
    private readonly _deviceIdService: DeviceIdService
  ) {}

  async push(payload: SyncPayload): Promise<Result<void, SyncError>> {
    const path = this._filePath(payload.conversation.id)

    if (payload.deletedAt) {
      return this._send<void>('sync:sftp:delete', { path })
    }

    const snapshot: ConversationSnapshotForUpload = {
      id: payload.conversation.id,
      syncVersion: payload.syncVersion,
      conversation: payload.conversation,
      messages: payload.messages,
      deviceId: payload.deviceId,
    }
    const content = JSON.stringify(snapshot, null, 2)
    return this._send<void>('sync:sftp:push', { path, content })
  }

  async pull(): Promise<Result<SyncPayload[], SyncError>> {
    const result = await this._send<{ files: Array<{ path: string; content: string }> }>(
      'sync:sftp:pull',
      { dirPath: this._remoteDir() }
    )
    if (result.isErr()) return err(result.error)

    const payloads: SyncPayload[] = []
    for (const file of result.value.files ?? []) {
      if (!file.path.endsWith(FILE_EXTENSION)) continue
      try {
        const snapshot = JSON.parse(file.content) as ConversationSnapshot
        payloads.push({
          syncId: `sftp:${snapshot.id}`,
          conversation: {
            ...snapshot.conversation,
            syncId: `sftp:${snapshot.id}`,
            syncVersion: snapshot.syncVersion,
          },
          messages: snapshot.messages,
          syncVersion: snapshot.syncVersion,
          deviceId: snapshot.deviceId ?? this._deviceIdService.getOrCreate(),
        })
      } catch {
        // Malformed remote file — skip, don't abort entire pull
      }
    }
    return ok(payloads)
  }

  async testConnection(): Promise<Result<void, SyncError>> {
    return this._send<void>('sync:sftp:test', {})
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async _send<T>(
    type: SftpRequest['type'],
    payload: Record<string, unknown>
  ): Promise<Result<T, SyncError>> {
    const requestId = crypto.randomUUID()
    const request = { type, requestId, ...payload }

    return this._bridge.postAndAwait<any>(
      request,
      (cb, ms) => setTimeout(cb, ms) as unknown as NodeJS.Timeout,
      (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>)
    ).then((result) => {
      if (result.isErr()) {
        const msg = result.error.message
        if (msg.includes('auth') || msg.includes('Authentication')) {
          return err(new SyncAuthError('sftp', msg))
        }
        return err(new SyncError('sftp', msg, result.error))
      }
      return ok(result.value as T)
    })
  }

  private _remoteDir(): string {
    return `${this._config.remotePath.replace(/\/$/, '')}/${FILE_PREFIX}`
  }

  private _filePath(conversationId: number): string {
    return `${this._remoteDir()}${conversationId}${FILE_EXTENSION}`
  }
}
