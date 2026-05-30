import { ok, err, type Result } from 'neverthrow'
import { SyncError, SyncAuthError } from '@/errors'
import type { ISyncAdapter, SyncPayload, ConversationSnapshot, ConversationSnapshotForUpload } from './types'
import type { DeviceIdService } from './device-id'

type Shard = {
  index: number
  url: string
  readOnly: boolean
}

type ShardMap = {
  n: number
  shards: Shard[]
}

export class WebDavSyncAdapter implements ISyncAdapter {
  readonly name = 'webdav'
  readonly backend = 'webdav' as const
  private _shardMap: ShardMap | null = null

  constructor(
    private readonly _config: { url: string; username: string; password: string },
    private readonly _deviceIdService: DeviceIdService
  ) {}

  async push(payload: SyncPayload): Promise<Result<void, SyncError | SyncAuthError>> {
    const shardResult = await this._getShardForWrite(payload.conversation.id)
    if (shardResult.isErr()) return err(shardResult.error)
    const shard = shardResult.value

    const offlineCheck = await this._checkOffline(shard.url)
    if (offlineCheck.isErr()) return err(offlineCheck.error)

    if (payload.deletedAt) {
      return this.notifyDeleted(payload.conversation.id)
    }

    try {
      // Threshold check for new files
      const exists = await this._fileExists(shard.url, `chats/${payload.conversation.id}.json`)
      if (!exists) {
        const thresholdResult = await this._ensureThreshold(shard)
        if (thresholdResult.isErr()) return err(thresholdResult.error)
      }

      const snapshot: ConversationSnapshotForUpload = {
        id: payload.conversation.id,
        syncVersion: payload.syncVersion,
        conversation: payload.conversation,
        messages: payload.messages,
        deviceId: payload.deviceId,
      }

      const response = await this._fetch(shard.url, `chats/${payload.conversation.id}.json`, {
        method: 'PUT',
        body: JSON.stringify(snapshot, null, 2),
        headers: { 'Content-Type': 'application/json' }
      })

      if (!response.ok) return err(this._mapError(response))

      // Update metadata
      await this._updateMetadata(shard, payload.conversation.id)

      return ok(undefined)
    } catch (e: any) {
      return err(new SyncError('webdav', e.message || String(e), e))
    }
  }

  async pull(since?: string): Promise<Result<SyncPayload[], SyncError>> {
    const mapResult = await this._getShardMap()
    if (mapResult.isErr()) return err(mapResult.error as SyncError)
    const map = mapResult.value

    const allPayloads: SyncPayload[] = []
    for (const shard of map.shards) {
      const offlineCheck = await this._checkOffline(shard.url)
      if (offlineCheck.isErr()) continue // Skip offline shards during pull

      const listResult = await this._listShardFiles(shard)
      if (listResult.isErr()) continue

      let files = listResult.value
      if (since) {
        const sinceDate = new Date(since)
        files = files.filter(f => f.lastmod > sinceDate)
      }

      for (const f of files) {
        const contentResult = await this._getFile(shard.url, f.path)
        if (contentResult.isErr()) continue

        try {
          const snapshot = JSON.parse(contentResult.value) as ConversationSnapshot
          allPayloads.push({
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
          // Ignore parse errors for individual files
        }
      }
    }

    return ok(allPayloads)
  }

  async testConnection(): Promise<Result<void, SyncError | SyncAuthError>> {
    const result = await this._checkOffline(this._config.url)
    if (result.isErr()) return err(result.error)
    return ok(undefined)
  }

  async notifyDeleted(conversationId: number): Promise<Result<void, SyncError>> {
    const shardResult = await this._getShardForId(conversationId)
    if (shardResult.isErr()) return err(shardResult.error as SyncError)
    const shard = shardResult.value

    const response = await this._fetch(shard.url, `chats/${conversationId}.json`, {
      method: 'DELETE'
    })

    if (!response.ok && response.status !== 404) {
      return err(this._mapError(response) as SyncError)
    }

    await this._removeFromMetadata(shard, conversationId)
    return ok(undefined)
  }

  private async _checkOffline(rootUrl: string): Promise<Result<void, SyncError>> {
    try {
      const response = await this._fetch(rootUrl, '', { method: 'HEAD' })
      if (!response.ok) return err(new SyncError('webdav', `Shard offline: ${response.status}`))
      return ok(undefined)
    } catch (e: any) {
      return err(new SyncError('webdav', `Shard offline: ${e.message}`, e))
    }
  }

  private async _getShardMap(): Promise<Result<ShardMap, SyncError | SyncAuthError>> {
    if (this._shardMap) return ok(this._shardMap)

    const response = await this._fetch(this._config.url, '_sync/shard_map.json')
    if (response.status === 404) {
      const newMap: ShardMap = {
        n: 1,
        shards: [{ index: 0, url: this._config.url, readOnly: false }]
      }
      const putRes = await this._fetch(this._config.url, '_sync/shard_map.json', {
        method: 'PUT',
        body: JSON.stringify(newMap, null, 2)
      })
      if (!putRes.ok) return err(this._mapError(putRes))
      this._shardMap = newMap
      return ok(newMap)
    }

    if (!response.ok) return err(this._mapError(response))

    try {
      this._shardMap = await response.json() as ShardMap
      return ok(this._shardMap!)
    } catch (e: any) {
      return err(new SyncError('webdav', 'Failed to parse shard map', e))
    }
  }

  private async _getShardForId(id: number): Promise<Result<Shard, SyncError | SyncAuthError>> {
    const mapResult = await this._getShardMap()
    if (mapResult.isErr()) return err(mapResult.error)
    const map = mapResult.value
    const index = Math.abs(id) % map.n
    const shard = map.shards.find(s => s.index === index) || map.shards[0]
    return ok(shard)
  }

  private async _getShardForWrite(id: number): Promise<Result<Shard, SyncError | SyncAuthError>> {
    const shardResult = await this._getShardForId(id)
    if (shardResult.isErr()) return err(shardResult.error)
    const shard = shardResult.value

    if (shard.readOnly) {
      return this._rotateShard(shard)
    }
    return ok(shard)
  }

  private async _rotateShard(currentShard: Shard): Promise<Result<Shard, SyncError | SyncAuthError>> {
    const mapResult = await this._getShardMap()
    if (mapResult.isErr()) return err(mapResult.error)
    const map = mapResult.value

    currentShard.readOnly = true
    const newIndex = map.n
    const newUrl = `${this._config.url}shard_${newIndex}/`

    const newShard: Shard = { index: newIndex, url: newUrl, readOnly: false }
    map.shards.push(newShard)
    map.n++

    const putRes = await this._fetch(this._config.url, '_sync/shard_map.json', {
      method: 'PUT',
      body: JSON.stringify(map, null, 2)
    })
    if (!putRes.ok) return err(this._mapError(putRes))

    return ok(newShard)
  }

  private async _ensureThreshold(shard: Shard): Promise<Result<void, SyncError | SyncAuthError>> {
    const metadata = await this._getMetadata(shard)
    if (Object.keys(metadata).length >= 50000) {
      const rotation = await this._rotateShard(shard)
      if (rotation.isErr()) return err(rotation.error)
    }
    return ok(undefined)
  }

  private async _getMetadata(shard: Shard): Promise<Record<number, number>> {
    const res = await this._fetch(shard.url, '.sync_metadata.json')
    if (!res.ok) return {}
    try {
      return await res.json()
    } catch {
      return {}
    }
  }

  private async _updateMetadata(shard: Shard, id: number): Promise<void> {
    const metadata = await this._getMetadata(shard)
    metadata[id] = Date.now()
    await this._fetch(shard.url, '.sync_metadata.json', {
      method: 'PUT',
      body: JSON.stringify(metadata)
    })
  }

  private async _removeFromMetadata(shard: Shard, id: number): Promise<void> {
    const metadata = await this._getMetadata(shard)
    delete metadata[id]
    await this._fetch(shard.url, '.sync_metadata.json', {
      method: 'PUT',
      body: JSON.stringify(metadata)
    })
  }

  private async _listShardFiles(shard: Shard): Promise<Result<Array<{ path: string, lastmod: Date }>, SyncError>> {
    const response = await this._fetch(shard.url, 'chats/', {
      method: 'PROPFIND',
      headers: { 'Depth': '1' }
    })
    if (!response.ok) return err(new SyncError('webdav', 'Failed to list files'))

    const text = await response.text()
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(text, 'text/xml')
    const responses = xmlDoc.getElementsByTagNameNS('*', 'response')

    const files: Array<{ path: string, lastmod: Date }> = []
    for (let i = 0; i < responses.length; i++) {
      const href = responses[i].getElementsByTagNameNS('*', 'href')[0]?.textContent || ''
      if (href.endsWith('.json') && !href.endsWith('.tmp')) {
        const lastmodText = responses[i].getElementsByTagNameNS('*', 'getlastmodified')[0]?.textContent || ''
        files.push({ path: href, lastmod: new Date(lastmodText) })
      }
    }
    return ok(files)
  }

  private async _getFile(root: string, path: string): Promise<Result<string, SyncError>> {
    const res = await this._fetch(root, path)
    if (!res.ok) return err(new SyncError('webdav', 'Failed to get file'))
    return ok(await res.text())
  }

  private async _fileExists(root: string, path: string): Promise<boolean> {
    const res = await this._fetch(root, path, { method: 'HEAD' })
    return res.ok
  }

  private _fetch(root: string, path: string, init: RequestInit = {}): Promise<Response> {
    const url = new URL(path, root).toString()
    const headers = new Headers(init.headers || {})
    const auth = btoa(`${this._config.username}:${this._config.password}`)
    headers.set('Authorization', `Basic ${auth}`)

    return fetch(url, { ...init, headers })
  }

  private _mapError(res: Response): SyncError | SyncAuthError {
    if (res.status === 401 || res.status === 403) {
      return new SyncAuthError('webdav', `Auth failed (${res.status})`)
    }
    return new SyncError('webdav', `HTTP Error ${res.status}`)
  }
}
