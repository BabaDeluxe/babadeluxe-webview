import { ok, err, type Result } from 'neverthrow'
import { SyncError, SyncAuthError, RateLimitError } from '@/errors'
import {
  type ISyncAdapter,
  type SyncPayload,
  type ConversationSnapshot,
  type ConversationSnapshotForUpload,
  type FetchFn,
} from '@/sync/types'
import {
  hashKey,
  shardIndex,
  loadShardMap,
  saveShardMap,
  loadMetadata,
  saveMetadata,
  splitIntoChunks,
  reassembleChunks,
} from '@/sync/shard-utils'

export abstract class BaseSyncAdapter implements ISyncAdapter {
  abstract readonly name: string

  constructor(protected readonly _rootUrl: string) {}

  async push(payload: SyncPayload): Promise<Result<void, SyncError>> {
    const offline = await this._checkOffline(this._rootUrl)
    if (offline) return err(new SyncError(this.name, 'Offline'))

    const conversationId = payload.conversation.id.toString()
    const content = this._serialize(payload)
    const key = conversationId

    try {
      const shardMap = await loadShardMap(this._getFetch(), this._rootUrl)
      let index = await shardIndex(key, shardMap.n)
      let shard = shardMap.shards.find((s) => s.index === index)!

      if ((await this._isShardFull(shard.url)) && !shard.readOnly) {
        shard.readOnly = true
        const newIndex = shardMap.n
        const newShardUrl = await this._createNewShardFolder(newIndex)
        shardMap.shards.push({ index: newIndex, url: newShardUrl, readOnly: false })
        shardMap.n++
        await saveShardMap(this._getFetch(), this._rootUrl, shardMap)

        // Re-route to new shard for this write
        index = newIndex
        shard = shardMap.shards.find((s) => s.index === index)!
      }

      const metadata = await loadMetadata(this._getFetch(), shard.url)
      const chunks = splitIntoChunks(content)
      const partPaths: string[] = []

      const hash = await hashKey(content)

      for (let i = 0; i < chunks.length; i++) {
        const path = `keys/${key}.${i.toString().padStart(3, '0')}.md`
        await this._putFile(shard.url, path, chunks[i])
        partPaths.push(path)
      }

      metadata.keys[key] = {
        path: partPaths[0],
        sha256: hash,
        ts: Date.now(),
        parts: partPaths,
        totalBytes: content.length,
        partSize: chunks[0]?.length || 0,
      }

      await saveMetadata(this._getFetch(), shard.url, metadata)
      return ok(undefined)
    } catch (e) {
      return err(this._handleError(e))
    }
  }

  async pull(): Promise<Result<SyncPayload[], SyncError>> {
    const offline = await this._checkOffline(this._rootUrl)
    if (offline) return err(new SyncError(this.name, 'Offline'))

    try {
      const shardMap = await loadShardMap(this._getFetch(), this._rootUrl)
      const allPayloads: SyncPayload[] = []

      for (const shard of shardMap.shards) {
        const metadata = await loadMetadata(this._getFetch(), shard.url)
        for (const [key, entry] of Object.entries(metadata.keys)) {
          const chunks: string[] = []
          const paths = entry.parts || [entry.path]

          let failed = false
          for (const path of paths) {
            const chunk = await this._getFile(shard.url, path)
            if (chunk === null) {
              failed = true
              break
            }
            chunks.push(chunk)
          }

          if (failed) {
            console.error(`[sync:${this.name}] Failed to fetch chunks for key ${key}`)
            continue
          }

          const content = reassembleChunks(chunks)
          const hash = await hashKey(content)
          if (hash !== entry.sha256) {
            console.warn(`[sync:${this.name}] SHA-256 mismatch for key ${key}`)
          }

          const payload = this._deserialize(content, key)
          if (payload) {
            allPayloads.push(payload)
          }
        }
      }

      return ok(allPayloads)
    } catch (e) {
      return err(this._handleError(e))
    }
  }

  abstract testConnection(): Promise<Result<void, SyncError>>

  protected abstract _getFetch(): FetchFn
  protected abstract _putFile(shardUrl: string, path: string, content: string): Promise<void>
  protected abstract _getFile(shardUrl: string, path: string): Promise<string | null>
  protected abstract _isShardFull(shardUrl: string): Promise<boolean>
  protected abstract _createNewShardFolder(index: number): Promise<string>

  protected async _checkOffline(url: string): Promise<boolean> {
    try {
      // Use the native fetch for offline check to avoid auth overhead or recursion
      const res = await fetch(url, { method: 'HEAD' })
      return !res.ok && res.status !== 401 && res.status !== 403 && res.status !== 405
    } catch {
      return true
    }
  }

  protected _serialize(payload: SyncPayload): string {
    const snapshot: ConversationSnapshotForUpload = {
      id: payload.conversation.id,
      syncVersion: payload.syncVersion,
      conversation: payload.conversation,
      messages: payload.messages,
      deviceId: payload.deviceId,
    }
    return btoa(unescape(encodeURIComponent(JSON.stringify(snapshot, null, 2))))
  }

  protected _deserialize(content: string, key: string): SyncPayload | null {
    try {
      const decoded = decodeURIComponent(escape(atob(content)))
      const snapshot = JSON.parse(decoded) as ConversationSnapshot

      return {
        syncId: `${this.name}:${key}`,
        conversation: {
          ...snapshot.conversation,
          syncId: `${this.name}:${key}`,
          syncVersion: snapshot.syncVersion,
        },
        messages: snapshot.messages,
        syncVersion: snapshot.syncVersion,
        deviceId: snapshot.deviceId || 'unknown',
      }
    } catch (e) {
      console.error(`[sync:${this.name}] Failed to parse content for key ${key}`, e)
      return null
    }
  }

  protected _handleError(e: unknown): SyncError {
    if (e instanceof SyncError || e instanceof SyncAuthError || e instanceof RateLimitError) {
      return e
    }
    return new SyncError(this.name, e instanceof Error ? e.message : String(e), e)
  }
}
