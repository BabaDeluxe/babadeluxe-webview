import { type ShardMap, type SyncMetadata, type FetchFn } from '@/sync/types'

export async function hashKey(key: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(key)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function shardIndex(key: string, n: number): Promise<number> {
  const hash = await hashKey(key)
  // Use first 8 hex chars for routing
  return parseInt(hash.slice(0, 8), 16) % n
}

export async function loadShardMap(fetchFn: FetchFn, rootUrl: string): Promise<ShardMap> {
  const url = rootUrl.endsWith('/')
    ? `${rootUrl}_sync/shard_map.json`
    : `${rootUrl}/_sync/shard_map.json`
  try {
    const res = await fetchFn(url)
    if (res.status === 404) {
      return { n: 1, shards: [{ index: 0, url: rootUrl, readOnly: false }] }
    }
    if (!res.ok) throw new Error(`Failed to load shard map: ${res.status}`)
    return (await res.json()) as ShardMap
  } catch (e) {
    if (e instanceof Error && e.message.includes('404')) {
      return { n: 1, shards: [{ index: 0, url: rootUrl, readOnly: false }] }
    }
    throw e
  }
}

export async function saveShardMap(
  fetchFn: FetchFn,
  rootUrl: string,
  map: ShardMap
): Promise<void> {
  const url = rootUrl.endsWith('/')
    ? `${rootUrl}_sync/shard_map.json`
    : `${rootUrl}/_sync/shard_map.json`
  const res = await fetchFn(url, {
    method: 'PUT',
    body: JSON.stringify(map, null, 2),
  })
  if (!res.ok) throw new Error(`Failed to save shard map: ${res.status}`)
}

export async function loadMetadata(fetchFn: FetchFn, shardUrl: string): Promise<SyncMetadata> {
  const url = shardUrl.endsWith('/')
    ? `${shardUrl}.sync_metadata.json`
    : `${shardUrl}/.sync_metadata.json`
  try {
    const res = await fetchFn(url)
    if (res.status === 404) return { keys: {} }
    if (!res.ok) throw new Error(`Failed to load metadata: ${res.status}`)
    return (await res.json()) as SyncMetadata
  } catch (e) {
    if (e instanceof Error && e.message.includes('404')) return { keys: {} }
    throw e
  }
}

export async function saveMetadata(
  fetchFn: FetchFn,
  shardUrl: string,
  meta: SyncMetadata
): Promise<void> {
  const url = shardUrl.endsWith('/')
    ? `${shardUrl}.sync_metadata.json`
    : `${shardUrl}/.sync_metadata.json`
  const res = await fetchFn(url, {
    method: 'PUT',
    body: JSON.stringify(meta, null, 2),
  })
  if (!res.ok) throw new Error(`Failed to save metadata: ${res.status}`)
}

// 95 MB target chunk size for consistency and safety across all Git backends
export const chunkSizeLimit = 95 * 1024 * 1024

export function splitIntoChunks(content: string, limit = chunkSizeLimit): string[] {
  const chunks: string[] = []
  let offset = 0
  while (offset < content.length) {
    chunks.push(content.slice(offset, offset + limit))
    offset += limit
  }
  return chunks
}

export function reassembleChunks(chunks: string[]): string {
  return chunks.join('')
}
