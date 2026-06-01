import { ok, err, type Result } from 'neverthrow'
import { SyncError } from '@/errors'
import {
  type ISyncAdapter,
  type ISyncBackendDriver,
  type SyncPayload,
  type ConversationSnapshot,
  type ConversationSnapshotForUpload,
  type FetchFn,
  type FetchResponse,
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

/**
 * Enterprise-grade orchestrator for sharded synchronization.
 * Implements a composition-based Strategy pattern to decouple logic from transport.
 */
export class ShardedSyncService implements ISyncAdapter {
  private readonly _maxConcurrency = 5

  constructor(private readonly _driver: ISyncBackendDriver) {}

  get name(): string {
    return this._driver.name
  }

  async testConnection(): Promise<Result<void, SyncError>> {
    return this._driver.testConnection()
  }

  /**
   * Pushes a conversation payload to the appropriate shard.
   * Handles automatic shard expansion and large-value chunking.
   */
  async push(payload: SyncPayload): Promise<Result<void, SyncError>> {
    const rootUrl = this._driver.getRootUrl()
    if (await this._checkOffline()) return err(new SyncError(this.name, 'Backend unreachable'))

    const conversationId = payload.conversation.id.toString()
    const content = this._serialize(payload)

    try {
      const fetchFn = this._getFetch()
      const shardMap = await loadShardMap(fetchFn, rootUrl)

      const index = await shardIndex(conversationId, shardMap.n)
      let shard = shardMap.shards.find((s) => s.index === index)!

      // Automatic Sharding: Threshold logic
      if ((await this._driver.isShardFull(shard.url)) && !shard.readOnly) {
        shard.readOnly = true
        const newShardUrl = await this._driver.createNewShardFolder(shardMap.n)
        shardMap.shards.push({ index: shardMap.n, url: newShardUrl, readOnly: false })
        shardMap.n++
        await saveShardMap(fetchFn, rootUrl, shardMap)
        shard = shardMap.shards[shardMap.n - 1]
      }

      const metadata = await loadMetadata(fetchFn, shard.url)
      const chunks = splitIntoChunks(content)
      const partPaths: string[] = []
      const hash = await hashKey(content)

      // Transactional integrity: chunks must be written before metadata update
      for (let i = 0; i < chunks.length; i++) {
        const path = `keys/${conversationId}.${i.toString().padStart(3, '0')}.md`
        await this._driver.putFile(shard.url, path, chunks[i])
        partPaths.push(path)
      }

      metadata.keys[conversationId] = {
        path: partPaths[0],
        sha256: hash,
        ts: Date.now(),
        parts: partPaths,
        totalBytes: content.length,
        partSize: chunks[0]?.length || 0,
      }

      await saveMetadata(fetchFn, shard.url, metadata)
      return ok(undefined)
    } catch (e) {
      return err(this._handleError(e))
    }
  }

  /**
   * Pulls all available conversations from all shards.
   * Leverages batch-parallel retrieval for optimal performance.
   */
  async pull(): Promise<Result<SyncPayload[], SyncError>> {
    const rootUrl = this._driver.getRootUrl()
    if (await this._checkOffline()) return err(new SyncError(this.name, 'Backend unreachable'))

    try {
      const fetchFn = this._getFetch()
      const shardMap = await loadShardMap(fetchFn, rootUrl)

      const shardResults = await Promise.all(
        shardMap.shards.map(async (shard) => {
          const metadata = await loadMetadata(fetchFn, shard.url)
          const payloads: SyncPayload[] = []
          const entries = Object.entries(metadata.keys)

          // Batch processing to respect platform rate limits
          for (let i = 0; i < entries.length; i += this._maxConcurrency) {
            const batch = entries.slice(i, i + this._maxConcurrency)
            const results = await Promise.all(
              batch.map(async ([key, entry]) => {
                const paths = entry.parts || [entry.path]
                const chunks: string[] = []
                for (const path of paths) {
                  const chunk = await this._driver.getFile(shard.url, path)
                  if (!chunk) return null
                  chunks.push(chunk)
                }
                const content = reassembleChunks(chunks)
                const hash = await hashKey(content)
                if (hash !== entry.sha256) {
                  console.warn(
                    `[sync:${this.name}] Data integrity warning: SHA-256 mismatch for key ${key}`
                  )
                }
                return this._deserialize(content, key)
              })
            )
            for (const p of results) if (p) payloads.push(p)
          }
          return payloads
        })
      )
      return ok(shardResults.flat())
    } catch (e) {
      return err(this._handleError(e))
    }
  }

  private async _checkOffline(): Promise<boolean> {
    try {
      const res = await this._driver.testConnection()
      return res.isErr() && res.error.message.includes('unreachable')
    } catch {
      return true
    }
  }

  /**
   * Internal bridge to wrap native fetch for utilities.
   */
  private _getFetch(): FetchFn {
    return async (url: string, options: unknown = {}): Promise<FetchResponse> => {
      const res = await fetch(url, options)
      return {
        ok: res.ok,
        status: res.status,
        json: async () => res.json(),
        text: async () => res.text(),
        headers: { get: (name: string) => res.headers.get(name) },
      }
    }
  }

  private _serialize(payload: SyncPayload): string {
    const snapshot: ConversationSnapshotForUpload = {
      id: payload.conversation.id,
      syncVersion: payload.syncVersion,
      conversation: payload.conversation,
      messages: payload.messages,
      deviceId: payload.deviceId,
    }
    return btoa(unescape(encodeURIComponent(JSON.stringify(snapshot, null, 2))))
  }

  private _deserialize(content: string, key: string): SyncPayload | null {
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
      console.error(`[sync:${this.name}] Deserialization failed for key ${key}`, e)
      return null
    }
  }

  private _handleError(e: unknown): SyncError {
    return e instanceof SyncError
      ? e
      : new SyncError(this.name, e instanceof Error ? e.message : String(e), e)
  }
}
