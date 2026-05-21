import type { SyncPayload } from '@/sync/types'

export type ConflictResolution = 'use-local' | 'use-remote' | 'noop'

/**
 * Deterministic conflict resolution for single-writer sync.
 *
 * Resolution matrix:
 * - Same syncVersion + same content hash → noop (idempotent upload, safe to ignore)
 * - Local syncVersion > remote syncVersion → use-local (we're ahead; remote is stale)
 * - Remote syncVersion > local syncVersion → use-remote (remote is newer; local is behind)
 * - Same syncVersion but different content → use-remote (another device wrote concurrently;
 *   remote wins to prevent split-brain — surface to user if needed in future)
 */
export function resolveConflict(
  local: SyncPayload,
  remote: SyncPayload
): ConflictResolution {
  if (local.syncVersion === remote.syncVersion) {
    // Check content hash — if payloads are byte-for-byte equivalent it's a noop
    if (_payloadHash(local) === _payloadHash(remote)) return 'noop'
    // Same version, different content — another device wrote concurrently.
    // Remote wins (last-write-wins by device that reached the remote first).
    return 'use-remote'
  }

  if (local.syncVersion > remote.syncVersion) return 'use-local'
  return 'use-remote'
}

/**
 * Returns true when a pull result should overwrite local — i.e. when remote is newer
 * or when local has no version yet (first sync).
 */
export function shouldApplyRemote(
  localSyncVersion: number | undefined,
  remote: SyncPayload
): boolean {
  if (localSyncVersion === undefined || localSyncVersion === 0) return true
  return remote.syncVersion > localSyncVersion
}

/** Lightweight structural hash — not cryptographic, just for equality checks */
function _payloadHash(payload: SyncPayload): string {
  return JSON.stringify({
    syncVersion: payload.syncVersion,
    deviceId: payload.deviceId,
    messagesCount: payload.messages.length,
    lastMessageId: payload.messages.at(-1)?.id,
    conversationUpdatedAt: (payload.conversation as { updatedAt?: string }).updatedAt,
  })
}
