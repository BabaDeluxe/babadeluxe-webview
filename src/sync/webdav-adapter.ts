import { createClient, type WebDAVClient, type FileStat } from 'webdav'
import { ok, err, type Result } from 'neverthrow'
import { SyncError, SyncAuthError, ConflictError } from '@/errors'
import type { ISyncAdapter, SyncPayload, ConversationSnapshot, ConversationSnapshotForUpload } from './types'
import type { DeviceIdService } from './device-id'

export class WebDavSyncAdapter implements ISyncAdapter {
  readonly name = 'webdav'
  readonly backend = 'webdav' as const
  private readonly _client: WebDAVClient
  private _etags = new Map<number, string>()

  constructor(
    private readonly _config: { url: string; username: string; password: string },
    private readonly _deviceIdService: DeviceIdService
  ) {
    this._client = createClient(this._config.url, {
      username: this._config.username,
      password: this._config.password,
    })
  }

  async push(payload: SyncPayload): Promise<Result<void, SyncError | SyncAuthError | ConflictError>> {
    const id = payload.conversation.id
    const path = `chats/${id}.json`
    const tmpPath = `${path}.tmp`

    if (payload.deletedAt) {
      return this.notifyDeleted(id)
    }

    try {
      // 1. PROPFIND preflight
      let remoteStat: FileStat | null = null
      try {
        remoteStat = await this._client.stat(path) as FileStat
      } catch (e: any) {
        if (e.response?.status !== 404) {
          throw e
        }
      }

      const remoteEtag = remoteStat?.etag
      const localEtag = this._etags.get(id)

      if (remoteEtag && localEtag && localEtag !== remoteEtag) {
        // Conflict check
        const content = await this._client.getFileContents(path, { format: 'text' }) as string
        const remote = JSON.parse(content) as ConversationSnapshot
        return err(new ConflictError('webdav', id, payload.syncVersion, remote.syncVersion))
      }

      // 2. PUT to .tmp
      const snapshot: ConversationSnapshotForUpload = {
        id: payload.conversation.id,
        syncVersion: payload.syncVersion,
        conversation: payload.conversation,
        messages: payload.messages,
        deviceId: payload.deviceId,
      }
      await this._client.putFileContents(tmpPath, JSON.stringify(snapshot, null, 2))

      // 3. MOVE
      await this._client.moveFile(tmpPath, path)

      // 4. PROPFIND for new ETag
      const newStat = await this._client.stat(path) as FileStat
      if (newStat.etag) {
        this._etags.set(id, newStat.etag)
      }

      return ok(undefined)
    } catch (e: any) {
      return err(this._mapError(e))
    }
  }

  async pull(since?: string): Promise<Result<SyncPayload[], SyncError>> {
    try {
      const contents = await this._client.getDirectoryContents('chats/') as FileStat[]
      let files = contents.filter(f => f.type === 'file' && f.filename.endsWith('.json') && !f.filename.endsWith('.tmp'))

      if (since) {
        const sinceDate = new Date(since)
        files = files.filter(f => new Date(f.lastmod) > sinceDate)
      }

      const payloads: SyncPayload[] = []
      for (const f of files) {
        try {
          const content = await this._client.getFileContents(f.filename, { format: 'text' }) as string
          const snapshot = JSON.parse(content) as ConversationSnapshot
          if (f.etag) {
            this._etags.set(snapshot.id, f.etag)
          }
          payloads.push({
            syncId: `webdav:${snapshot.id}`,
            conversation: {
              ...snapshot.conversation,
              syncId: `webdav:${snapshot.id}`,
              syncVersion: snapshot.syncVersion,
            },
            messages: snapshot.messages,
            syncVersion: snapshot.syncVersion,
            deviceId: snapshot.deviceId ?? this._deviceIdService.getOrCreate(),
          })
        } catch (e) {
          return err(new SyncError('webdav', `Failed to parse ${f.filename}`, e))
        }
      }

      return ok(payloads)
    } catch (e: any) {
      return err(this._mapError(e) as SyncError)
    }
  }

  async testConnection(): Promise<Result<void, SyncError | SyncAuthError>> {
    try {
      const exists = await this._client.exists('chats/')
      if (!exists) {
        await this._client.createDirectory('chats/')
      }
      await this._client.stat('chats/')
      return ok(undefined)
    } catch (e: any) {
      return err(this._mapError(e))
    }
  }

  async notifyDeleted(conversationId: number): Promise<Result<void, SyncError>> {
    const path = `chats/${conversationId}.json`
    try {
      await this._client.deleteFile(path)
      this._etags.delete(conversationId)
      return ok(undefined)
    } catch (e: any) {
      if (e.response?.status === 404) {
        this._etags.delete(conversationId)
        return ok(undefined)
      }
      return err(this._mapError(e) as SyncError)
    }
  }

  private _mapError(e: any): SyncError | SyncAuthError {
    const status = e.response?.status
    if (status === 401 || status === 403) {
      return new SyncAuthError('webdav', `Auth failed (${status})`, e)
    }
    return new SyncError('webdav', e.message || String(e), e)
  }
}
