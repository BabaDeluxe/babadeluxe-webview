import { ok, err, type Result } from 'neverthrow'
import { SyncError } from '@/errors'
import {
  type ISyncAdapter,
  type ISyncBackendDriver,
  type SyncPayload,
  type ConversationSnapshot,
  type ConversationSnapshotForUpload,
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
 * Orchestrates sharding, chunking, and metadata management using a backend driver.
 * Follows the "Composition over Inheritance" principle.
 */
export class ShardedSyncService implements ISyncAdapter {
  constructor(private readonly _driver: ISyncBackendDriver) {}

  get name(): string {
    return this._driver.name
  }

  async testConnection(): Promise<Result<void, SyncError>> {
    return this._driver.testConnection()
  }

  async push(payload: SyncPayload): Promise<Result<void, SyncError>> {
    const rootUrl = this._driver.getRootUrl()
    const offline = await this._checkOffline(rootUrl)
    if (offline) return err(new SyncError(this.name, 'Offline'))

    const conversationId = payload.conversation.id.toString()
    const content = this._serialize(payload)
    const key = conversationId

    try {
      const fetchFn = this._driver.getFetch()
      const shardMap = await loadShardMap(fetchFn, rootUrl)
      let index = await shardIndex(key, shardMap.n)
      let shard = shardMap.shards.find((s) => s.index === index)!

      if ((await this._driver.isShardFull(shard.url)) && !shard.readOnly) {
        shard.readOnly = true
        const newIndex = shardMap.n
        const newShardUrl = await this._driver.createNewShardFolder(newIndex)
        shardMap.shards.push({ index: newIndex, url: newShardUrl, readOnly: false })
        shardMap.n++
        await saveShardMap(fetchFn, rootUrl, shardMap)

        index = newIndex
        shard = shardMap.shards.find((s) => s.index === index)!
      }

      const metadata = await loadMetadata(fetchFn, shard.url)
      const chunks = splitIntoChunks(content)
      const partPaths: string[] = []

      const hash = await hashKey(content)

      for (let i = 0; i < chunks.length; i++) {
        const path = `keys/${key}.${i.toString().padStart(3, '0')}.md`
        await this._driver.putFile(shard.url, path, chunks[i])
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

      await saveMetadata(fetchFn, shard.url, metadata)
      return ok(undefined)
    } catch (e) {
      return err(this._handleError(e))
    }
  }

  async pull(): Promise<Result<SyncPayload[], SyncError>> {
    const rootUrl = this._driver.getRootUrl()
    const offline = await this._checkOffline(rootUrl)
    if (offline) return err(new SyncError(this.name, 'Offline'))

    try {
      const fetchFn = this._driver.getFetch()
      const shardMap = await loadShardMap(fetchFn, rootUrl)

      // Parallelize shard processing
      const shardResults = await Promise.all(
        shardMap.shards.map(async (shard) => {
          const metadata = await loadMetadata(fetchFn, shard.url)
          const payloads: SyncPayload[] = []

          for (const [key, entry] of Object.entries(metadata.keys)) {
            const paths = entry.parts || [entry.path]

            // Fetch chunks for this key (parallel or sequential depending on backend constraints)
            // Sequential for now to preserve memory and handle large values safely
            const chunks: string[] = []
            let failed = false
            for (const path of paths) {
              const chunk = await this._driver.getFile(shard.url, path)
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
              payloads.push(payload)
            }
          }
          return payloads
        })
      )

      return ok(shardResults.flat())
    } catch (e) {
      return err(this._handleError(e))
    }
  }

  private async _checkOffline(url: string): Promise<boolean> {
    try {
      const res = await fetch(url, { method: 'HEAD' })
      return !res.ok && res.status !== 401 && res.status !== 403 && res.status !== 405
    } catch {
      return true
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
      console.error(`[sync:${this.name}] Failed to parse content for key ${key}`, e)
      return null
    }
  }

  private _handleError(e: unknown): SyncError {
    return e instanceof SyncError
      ? e
      : new SyncError(this.name, e instanceof Error ? e.message : String(e), e)
  }
}
