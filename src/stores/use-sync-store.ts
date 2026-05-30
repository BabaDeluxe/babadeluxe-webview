import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { type SyncStatus, type SyncBackend, type ConflictInfo, type SyncConfig } from '@/sync/types'
import { SyncManager } from '@/sync/sync-manager'
import { GitHubSyncAdapter } from '@/sync/github-adapter'
import { WebDavSyncAdapter } from '@/sync/webdav-adapter'
import { GitLabSyncAdapter } from '@/sync/gitlab-adapter'
import { AzureDevOpsSyncAdapter } from '@/sync/azure-devops-adapter'
import { DeviceIdService } from '@/sync/device-id'
import { safeInject } from '@/safe-inject'
import { APP_DB_KEY, LOGGER_KEY } from '@/injection-keys'

export const useSyncStore = defineStore('sync', () => {
  const db = safeInject(APP_DB_KEY)
  const logger = safeInject(LOGGER_KEY)

  const deviceIdService = new DeviceIdService()
  const deviceId = deviceIdService.getOrCreate()
  const manager = new SyncManager(db, logger, deviceId)

  const status = ref<SyncStatus>({ state: 'idle' })
  const activeBackend = ref<SyncBackend | null>(null)
  const conflict = ref<ConflictInfo | null>(null)

  manager.onStatusChange((s) => {
    status.value = s
    if (s.state === 'conflict') {
      conflict.value = s.info
    } else {
      conflict.value = null
    }
  })

  const isSyncing = computed(() => status.value.state === 'syncing')
  const hasConflict = computed(() => status.value.state === 'conflict')
  const lastSyncAt = computed(() =>
    status.value.state === 'success' ? status.value.lastSyncAt : null
  )

  async function configure(config: SyncConfig | null): Promise<void> {
    if (!config) {
      manager.setAdapter(null)
      activeBackend.value = null
      return
    }

    let adapter = null

    if (config.backend === 'github') {
      adapter = new GitHubSyncAdapter(config)
    } else if (config.backend === 'webdav') {
      adapter = new WebDavSyncAdapter(config)
    } else if (config.backend === 'gitlab') {
      adapter = new GitLabSyncAdapter(config)
    } else if (config.backend === 'azure-devops') {
      adapter = new AzureDevOpsSyncAdapter(config)
    }

    if (adapter) {
      manager.setAdapter(adapter)
      activeBackend.value = config.backend as SyncBackend

      const testResult = await adapter.testConnection()
      if (testResult.isErr()) {
        status.value = { state: 'error', error: testResult.error }
        return
      }

      void manager.pullAll()
      return
    }

    logger.warn(`Sync adapter '${config.backend}' not yet implemented`)
  }

  function notifyChanged(conversationId: number): void {
    manager.notifyChanged(conversationId)
  }

  function notifyDeleted(conversationId: number, syncVersion: number): void {
    manager.notifyDeleted(conversationId, syncVersion)
  }

  async function syncNow(): Promise<void> {
    await manager.syncNow()
  }

  async function resolveConflict(resolution: 'local-wins' | 'remote-wins'): Promise<void> {
    if (!conflict.value) return
    await manager.resolveConflict(conflict.value, resolution)
  }

  return {
    status,
    activeBackend,
    conflict,
    isSyncing,
    hasConflict,
    lastSyncAt,
    configure,
    notifyChanged,
    notifyDeleted,
    syncNow,
    resolveConflict,
  }
})
