import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ok, err, type Result } from 'neverthrow'
import { safeInject } from '@/safe-inject'
import { APP_DB_KEY, LOGGER_KEY } from '@/injection-keys'
import { SyncManager } from '@/sync/sync-manager'
import { GitHubSyncAdapter, type GitHubAdapterConfig } from '@/sync/github-adapter'
import type { SyncError } from '@/sync/types'
import type { KeyValueStore } from '@/database/key-value-store'

/**
 * useSyncStore
 *
 * Thin Pinia wrapper exposing reactive sync state to the UI.
 * All heavy lifting is in SyncManager (plain service — no Pinia dependency).
 *
 * Integration in useConversationStore — add after every successful DB write:
 *
 *   const syncStore = useSyncStore()
 *
 *   // After createConversation / updateConversationTitle / createUserMessage
 *   // / finalizeAssistantMessage / updateUserMessage:
 *   void syncStore.notifyMutated(conversationId)
 *
 *   // After deleteConversation — read syncId from conversation BEFORE deleting:
 *   void syncStore.notifyDeleted(conversationId, conversation.syncId)
 *
 * The store does NOT auto-initialise. The user calls configure() from
 * the settings panel after supplying credentials.
 */
export const useSyncStore = defineStore('sync', () => {
  const logger = safeInject(LOGGER_KEY)
  const appDb = safeInject(APP_DB_KEY)

  // ─── Reactive state ─────────────────────────────────────────────────────────

  const isSyncing = ref(false)
  const lastSyncAt = ref<Date | undefined>(undefined)
  const syncError = ref<string | undefined>(undefined)
  const pendingCount = ref(0)
  const isConfigured = ref(false)

  let _manager: SyncManager | undefined

  const hasPending = computed(() => pendingCount.value > 0)

  // ─── Configuration ───────────────────────────────────────────────────────────

  /**
   * Configure with a GitHub adapter.
   * WebDAV / SFTP adapters will extend this union when added in phase 2/3.
   */
  async function configure(
    type: 'github',
    config: GitHubAdapterConfig,
    kv: KeyValueStore
  ): Promise<Result<void, SyncError>> {
    _manager?.stop()

    const adapter = new GitHubSyncAdapter(config)
    _manager = new SyncManager(appDb, kv, logger, {
      adapter,
      pushDebounceMs: 2_000,
      pullIntervalMs: 60_000,
    })

    await _manager.start()
    isConfigured.value = true
    syncError.value = undefined
    return ok(undefined)
  }

  function deconfigure(): void {
    _manager?.stop()
    _manager = undefined
    isConfigured.value = false
    pendingCount.value = 0
    syncError.value = undefined
  }

  // ─── Mutation hooks ──────────────────────────────────────────────────────────

  async function notifyMutated(conversationId: number): Promise<void> {
    if (!_manager) return
    pendingCount.value += 1
    await _manager.notifyConversationMutated(conversationId)
  }

  async function notifyDeleted(conversationId: number, syncId: string): Promise<void> {
    if (!_manager) return
    await _manager.notifyConversationDeleted(conversationId, syncId)
  }

  // ─── Manual sync ─────────────────────────────────────────────────────────────

  async function syncNow(): Promise<Result<void, SyncError>> {
    if (!_manager) {
      return err({
        name: 'SyncError',
        message: 'Sync not configured',
      } as unknown as SyncError)
    }
    if (isSyncing.value) return ok(undefined)

    isSyncing.value = true
    syncError.value = undefined

    const result = await _manager.syncNow()

    isSyncing.value = false
    if (result.isOk()) {
      lastSyncAt.value = new Date()
      pendingCount.value = 0
    } else {
      syncError.value = result.error.message
    }

    return result
  }

  // ─── Exports ─────────────────────────────────────────────────────────────────

  return {
    isSyncing,
    lastSyncAt,
    syncError,
    pendingCount,
    hasPending,
    isConfigured,
    configure,
    deconfigure,
    notifyMutated,
    notifyDeleted,
    syncNow,
  }
})
