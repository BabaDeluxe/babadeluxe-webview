import { ok, err, type Result } from 'neverthrow'
import { SyncError, SyncAuthError, ConflictError } from '@/errors'
import type { ISyncAdapter, SyncPayload, ConversationSnapshot, ConversationSnapshotForUpload } from '@/sync/types'
import type { DeviceIdService } from '@/sync/device-id'

const FILE_PREFIX = 'chats/'
const FILE_EXTENSION = '.json'

export type WebDavAdapterConfig = {
  url: string
  username: string
  password: string
}

export class WebDavSyncAdapter implements ISyncAdapter {
  readonly name = 'webdav'

  constructor(
    private readonly _config: WebDavAdapterConfig,
    private readonly _deviceIdService: DeviceIdService
  ) {}

  async push(payload: SyncPayload): Promise<Result<void, SyncError>> {
    if (payload.deletedAt) {
      return this._remove(payload.conversation.id)
    }
    const snapshot: ConversationSnapshotForUpload = {
      id: payload.conversation.id,
      syncVersion: payload.syncVersion,
      conversation: payload.conversation,
      messages: payload.messages,
      deviceId: payload.deviceId,
    }
    return this._upload(snapshot)
  }

  async pull(): Promise<Result<SyncPayload[], SyncError>> {
    const listResult = await this._listRemote()
    if (listResult.isErr()) return err(listResult.error)

    const payloads: SyncPayload[] = []

    for (const { id } of listResult.value) {
      const downloadResult = await this._download(id)
      if (downloadResult.isErr()) return err(downloadResult.error)
      const snapshot = downloadResult.value
      if (!snapshot) continue

      const payload: SyncPayload = {
        syncId: `webdav:${id}`,
        conversation: {
          ...snapshot.conversation,
          syncId: `webdav:${id}`,
          syncVersion: snapshot.syncVersion,
        },
        messages: snapshot.messages,
        syncVersion: snapshot.syncVersion,
        deviceId: snapshot.deviceId ?? this._deviceIdService.getOrCreate(),
      }
      payloads.push(payload)
    }

    return ok(payloads)
  }

  async testConnection(): Promise<Result<void, SyncError>> {
    const result = await this._request('HEAD', this._baseDir())
    if (result.isErr()) return err(result.error)
    return ok(undefined)
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async _upload(snapshot: ConversationSnapshotForUpload): Promise<Result<void, SyncError>> {
    const url = this._fileUrl(snapshot.id)
    const body = JSON.stringify({ ...snapshot, deviceId: snapshot.deviceId ?? this._deviceIdService.getOrCreate() }, null, 2)

    // Fetch current ETag for optimistic locking
    const etagResult = await this._getEtag(url)
    const etag = etagResult.isOk() ? etagResult.value : null

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...this._authHeader(),
    }
    if (etag) {
      // If-Match ensures we don't overwrite a newer remote version
      ;(headers as Record<string, string>)['If-Match'] = etag
    }

    try {
      const res = await fetch(url, { method: 'PUT', headers, body })

      if (res.status === 401 || res.status === 403) {
        return err(new SyncAuthError('webdav', `HTTP ${res.status}`))
      }

      if (res.status === 412) {
        // Precondition Failed — remote has diverged; surface as ConflictError
        return err(
          new ConflictError('webdav', snapshot.id, snapshot.syncVersion, -1)
        )
      }

      if (!res.ok) {
        return err(new SyncError('webdav', `PUT failed: HTTP ${res.status}`))
      }

      return ok(undefined)
    } catch (e) {
      return err(new SyncError('webdav', `Network error during PUT: ${e instanceof Error ? e.message : String(e)}`, e))
    }
  }

  private async _download(conversationId: number): Promise<Result<ConversationSnapshot | null, SyncError>> {
    const url = this._fileUrl(conversationId)
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { ...this._authHeader(), Accept: 'application/json' },
      })

      if (res.status === 404) return ok(null)
      if (res.status === 401 || res.status === 403) {
        return err(new SyncAuthError('webdav', `HTTP ${res.status}`))
      }
      if (!res.ok) {
        return err(new SyncError('webdav', `GET failed: HTTP ${res.status}`))
      }

      try {
        const snapshot = (await res.json()) as ConversationSnapshot
        return ok(snapshot)
      } catch (e) {
        return err(new SyncError('webdav', `Failed to parse remote snapshot for conversation ${conversationId}`, e))
      }
    } catch (e) {
      return err(new SyncError('webdav', `Network error during GET: ${e instanceof Error ? e.message : String(e)}`, e))
    }
  }

  private async _remove(conversationId: number): Promise<Result<void, SyncError>> {
    const url = this._fileUrl(conversationId)
    try {
      const res = await fetch(url, {
        method: 'DELETE',
        headers: this._authHeader(),
      })

      if (res.status === 404) return ok(undefined)
      if (res.status === 401 || res.status === 403) {
        return err(new SyncAuthError('webdav', `HTTP ${res.status}`))
      }
      if (!res.ok) {
        return err(new SyncError('webdav', `DELETE failed: HTTP ${res.status}`))
      }
      return ok(undefined)
    } catch (e) {
      return err(new SyncError('webdav', `Network error during DELETE: ${e instanceof Error ? e.message : String(e)}`, e))
    }
  }

  private async _listRemote(): Promise<Result<Array<{ id: number }>, SyncError>> {
    // PROPFIND depth 1 to list files in the chats/ directory
    const body = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop><D:displayname/></D:prop>
</D:propfind>`

    try {
      const res = await fetch(this._baseDir(), {
        method: 'PROPFIND',
        headers: {
          ...this._authHeader(),
          Depth: '1',
          'Content-Type': 'application/xml',
        },
        body,
      })

      if (res.status === 404) return ok([])
      if (res.status === 401 || res.status === 403) {
        return err(new SyncAuthError('webdav', `HTTP ${res.status}`))
      }
      if (!res.ok && res.status !== 207) {
        return err(new SyncError('webdav', `PROPFIND failed: HTTP ${res.status}`))
      }

      const xml = await res.text()
      const ids = this._parseMultistatus(xml)
      return ok(ids.map((id) => ({ id })))
    } catch (e) {
      return err(new SyncError('webdav', `Network error during PROPFIND: ${e instanceof Error ? e.message : String(e)}`, e))
    }
  }

  private async _getEtag(url: string): Promise<Result<string, SyncError>> {
    try {
      const res = await fetch(url, { method: 'HEAD', headers: this._authHeader() })
      if (!res.ok) return err(new SyncError('webdav', `HEAD failed: HTTP ${res.status}`))
      const etag = res.headers.get('ETag')
      if (!etag) return err(new SyncError('webdav', 'No ETag in HEAD response'))
      return ok(etag)
    } catch (e) {
      return err(new SyncError('webdav', `HEAD error: ${e instanceof Error ? e.message : String(e)}`, e))
    }
  }

  private async _request(method: string, url: string): Promise<Result<void, SyncError>> {
    try {
      const res = await fetch(url, { method, headers: this._authHeader() })
      if (res.status === 401 || res.status === 403) {
        return err(new SyncAuthError('webdav', `HTTP ${res.status}`))
      }
      if (!res.ok) return err(new SyncError('webdav', `${method} failed: HTTP ${res.status}`))
      return ok(undefined)
    } catch (e) {
      return err(new SyncError('webdav', `Network error: ${e instanceof Error ? e.message : String(e)}`, e))
    }
  }

  /** Parse a WebDAV 207 Multi-Status XML body and return conversation IDs */
  private _parseMultistatus(xml: string): number[] {
    const ids: number[] = []
    // Simple regex-based parse — avoids DOM parser dependency issues in webview context
    const hrefPattern = /<[Dd]:[Hh]ref>([^<]+)<\/[Dd]:[Hh]ref>/g
    let match: RegExpExecArray | null
    while ((match = hrefPattern.exec(xml)) !== null) {
      const href = decodeURIComponent(match[1].trim())
      const filename = href.split('/').pop() ?? ''
      if (!filename.endsWith(FILE_EXTENSION)) continue
      const id = parseInt(filename.replace(FILE_EXTENSION, ''), 10)
      if (!isNaN(id)) ids.push(id)
    }
    return ids
  }

  private _authHeader(): Record<string, string> {
    const credentials = btoa(`${this._config.username}:${this._config.password}`)
    return { Authorization: `Basic ${credentials}` }
  }

  private _baseDir(): string {
    return `${this._config.url.replace(/\/$/, '')}/${FILE_PREFIX}`
  }

  private _fileUrl(conversationId: number): string {
    return `${this._baseDir()}${conversationId}${FILE_EXTENSION}`
  }
}
