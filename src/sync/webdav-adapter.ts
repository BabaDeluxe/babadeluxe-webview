import { ok, err, type Result } from 'neverthrow'
import { SyncError, SyncAuthError } from '@/errors'
import type { ISyncAdapter, SyncPayload } from '@/sync/types'

const CHATS_DIR = 'chats'
const SYNC_DIR = '_sync'
const SHARD_MAP_PATH = `${SYNC_DIR}/shard_map.json`
const METADATA_FILE = '.sync_metadata.json'
const KEY_THRESHOLD = 50000

type Shard = {
  index: number
  url: string
  readOnly: boolean
}

type ShardMap = {
  n: number
  shards: Shard[]
}

type Metadata = {
  keys: string[]
}

export class WebDAVSyncAdapter implements ISyncAdapter {
  readonly name = 'webdav'
  readonly backend = 'webdav' as const
  private _shardMap: ShardMap | null = null

  constructor(private readonly _config: { url: string; username: string; password: string }) {}

  async push(payload: SyncPayload): Promise<Result<void, SyncError>> {
    const id = payload.conversation.id.toString()

    // Step 5: Select shard via hash(key) % n
    let shardResult = await this._getShard(id)
    if (shardResult.isErr()) return err(shardResult.error)
    let shard = shardResult.value

    // Step 7: Offline check HEAD <shard-root>
    const offlineCheck = await this._request('HEAD', shard.url)
    if (offlineCheck.isErr()) return err(offlineCheck.error)

    if (payload.deletedAt) {
      return this.notifyDeleted(payload.conversation.id)
    }

    // Step 5: If readOnly: true, create new shard and use it
    if (shard.readOnly) {
      const rotateResult = await this._rotateShard()
      if (rotateResult.isErr()) return err(rotateResult.error)
      shard = rotateResult.value

      // Re-check offline for new shard
      const reOfflineCheck = await this._request('HEAD', shard.url)
      if (reOfflineCheck.isErr()) return err(reOfflineCheck.error)
    }

    // Step 6: Threshold check
    let metadataResult = await this._getMetadata(shard)
    if (metadataResult.isErr()) return err(metadataResult.error)
    let metadata = metadataResult.value

    if (!metadata.keys.includes(id)) {
      if (metadata.keys.length >= KEY_THRESHOLD) {
        // mark shard read-only, create new shard, redirect write there
        shard.readOnly = true
        const rotateResult = await this._rotateShard()
        if (rotateResult.isErr()) return err(rotateResult.error)
        shard = rotateResult.value

        // Refresh metadata for the new shard (which is empty)
        metadata = { keys: [id] }
      } else {
        metadata.keys.push(id)
      }
      const updateMeta = await this._putMetadata(shard, metadata)
      if (updateMeta.isErr()) return err(updateMeta.error)
    }

    const content = JSON.stringify(payload)
    const filePath = `${shard.url}/${CHATS_DIR}/${id}.json`

    // Step 2: Every write is plain PUT
    const res = await this._request('PUT', filePath, content)
    if (res.isErr()) return err(res.error)

    return ok(undefined)
  }

  async pull(since?: string): Promise<Result<SyncPayload[], SyncError>> {
    const shardMapResult = await this._ensureShardMap()
    if (shardMapResult.isErr()) return err(shardMapResult.error)

    const allPayloads: SyncPayload[] = []
    for (const shard of this._shardMap!.shards) {
      // Step 7: Offline check HEAD <shard-root>
      const offlineCheck = await this._request('HEAD', shard.url)
      if (offlineCheck.isErr()) return err(offlineCheck.error)

      // Step 4: PROPFIND to list all .json files
      const listRes = await this._list(shard)
      if (listRes.isErr()) continue

      const files = listRes.value
      const sinceDate = since ? new Date(since) : null

      for (const file of files) {
        if (sinceDate && file.lastmod && new Date(file.lastmod) <= sinceDate) continue

        const downloadRes = await this._request('GET', file.url)
        if (downloadRes.isOk()) {
          try {
            allPayloads.push(JSON.parse(downloadRes.value) as SyncPayload)
          } catch {
            // Ignore parse errors as per spec
          }
        }
      }
    }

    return ok(allPayloads)
  }

  async testConnection(): Promise<Result<void, SyncError>> {
    const res = await this._request('PROPFIND', this._config.url, undefined, { Depth: '0' })
    if (res.isErr()) return err(res.error)
    return ok(undefined)
  }

  async notifyDeleted(conversationId: number): Promise<Result<void, SyncError>> {
    const id = conversationId.toString()
    const shardResult = await this._getShard(id)
    if (shardResult.isErr()) return err(shardResult.error)
    const shard = shardResult.value

    const filePath = `${shard.url}/${CHATS_DIR}/${id}.json`
    const res = await this._request('DELETE', filePath)
    if (res.isErr() && res.error.message.includes('404')) return ok(undefined)
    if (res.isErr()) return err(res.error)

    return ok(undefined)
  }

  private async _getShard(key: string): Promise<Result<Shard, SyncError>> {
    const mapResult = await this._ensureShardMap()
    if (mapResult.isErr()) return err(mapResult.error)

    const index = this._hash(key) % this._shardMap!.n
    const shard = this._shardMap!.shards.find((s) => s.index === index)
    if (!shard) return err(new SyncError('webdav', 'Shard not found'))

    return ok(shard)
  }

  private async _ensureShardMap(): Promise<Result<void, SyncError>> {
    if (this._shardMap) return ok(undefined)

    const res = await this._request('GET', `${this._config.url}/${SHARD_MAP_PATH}`)
    if (res.isOk()) {
      try {
        this._shardMap = JSON.parse(res.value) as ShardMap
        return ok(undefined)
      } catch {
        // Fall through to initialize
      }
    }

    // Step 5: Initialize shard map
    await this._request('MKCOL', `${this._config.url}/${SYNC_DIR}`)
    await this._request('MKCOL', `${this._config.url}/${CHATS_DIR}`)

    const initialMap: ShardMap = {
      n: 1,
      shards: [{ index: 0, url: this._config.url, readOnly: false }]
    }
    const initRes = await this._request('PUT', `${this._config.url}/${SHARD_MAP_PATH}`, JSON.stringify(initialMap))
    if (initRes.isErr()) return err(initRes.error)

    this._shardMap = initialMap
    return ok(undefined)
  }

  private async _rotateShard(): Promise<Result<Shard, SyncError>> {
    if (!this._shardMap) return err(new SyncError('webdav', 'Map not initialized'))

    // Mark all existing as readOnly
    for (const s of this._shardMap.shards) {
      s.readOnly = true
    }

    const newIndex = this._shardMap.n
    const newUrl = `${this._config.url}/shard_${newIndex}`

    await this._request('MKCOL', newUrl)
    await this._request('MKCOL', `${newUrl}/${CHATS_DIR}`)

    const newShard: Shard = { index: newIndex, url: newUrl, readOnly: false }
    this._shardMap.shards.push(newShard)
    this._shardMap.n++

    const updateRes = await this._request('PUT', `${this._config.url}/${SHARD_MAP_PATH}`, JSON.stringify(this._shardMap))
    if (updateRes.isErr()) return err(updateRes.error)

    return ok(newShard)
  }

  private async _getMetadata(shard: Shard): Promise<Result<Metadata, SyncError>> {
    const res = await this._request('GET', `${shard.url}/${METADATA_FILE}`)
    if (res.isOk()) {
      try {
        return ok(JSON.parse(res.value) as Metadata)
      } catch {
        return ok({ keys: [] })
      }
    }
    return ok({ keys: [] })
  }

  private async _putMetadata(shard: Shard, metadata: Metadata): Promise<Result<void, SyncError>> {
    const res = await this._request('PUT', `${shard.url}/${METADATA_FILE}`, JSON.stringify(metadata))
    if (res.isErr()) return err(res.error)
    return ok(undefined)
  }

  private async _list(shard: Shard): Promise<Result<Array<{ url: string; lastmod?: string }>, SyncError>> {
    const res = await this._request('PROPFIND', `${shard.url}/${CHATS_DIR}`, undefined, { Depth: '1' })
    if (res.isErr()) return err(res.error)

    const urls: Array<{ url: string; lastmod?: string }> = []
    const matches = res.value.matchAll(/<[a-z0-9]+:response>[\s\S]*?<[a-z0-9]+:href>([^<]+)<\/[a-z0-9]+:href>[\s\S]*?(?:<[a-z0-9]+:getlastmodified>([^<]+)<\/[a-z0-9]+:getlastmodified>)?[\s\S]*?<\/[a-z0-9]+:response>/gi)
    for (const match of matches) {
      if (match[1].endsWith('.json')) {
        urls.push({ url: match[1], lastmod: match[2] })
      }
    }
    return ok(urls)
  }

  private _hash(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i)
      hash |= 0
    }
    return Math.abs(hash)
  }

  private async _request(method: string, url: string, body?: string, headers: Record<string, string> = {}): Promise<Result<string, SyncError>> {
    const creds = `${this._config.username}:${this._config.password}`
    const auth = typeof btoa !== 'undefined' ? btoa(creds) : Buffer.from(creds).toString('base64')

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Basic ${auth}`,
          ...headers
        },
        body
      })

      if (response.status === 401 || response.status === 403) {
        return err(new SyncAuthError('webdav', `HTTP ${response.status}`))
      }

      if (method === 'HEAD') {
        if (!response.ok) return err(new SyncError('webdav', 'Offline'))
        return ok('')
      }

      if (method === 'MKCOL' && (response.ok || response.status === 405)) {
        return ok('')
      }

      if (!response.ok && response.status !== 404) {
        return err(new SyncError('webdav', `HTTP ${response.status}`))
      }

      const text = response.text ? await response.text() : ''
      return ok(text)
    } catch (e) {
      return err(new SyncError('webdav', method === 'HEAD' ? 'Offline' : 'Network error', e))
    }
  }
}
