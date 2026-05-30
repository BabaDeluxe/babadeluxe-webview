import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
  type SyncStatus,
  type SyncBackend,
  type ConflictInfo,
  type SyncConfig,
  type ISyncAdapter,
} from '@/sync/types'
import { SyncManager } from '@/sync/sync-manager'
import { ShardedSyncService } from '@/sync/sharded-sync-service'
import { GitHubBackendDriver } from '@/sync/github-adapter'
import { WebDavBackendDriver } from '@/sync/webdav-adapter'
import { GitLabBackendDriver } from '@/sync/gitlab-adapter'
import { AzureDevOpsBackendDriver } from '@/sync/azure-devops-adapter'
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

    let adapter: ISyncAdapter | null = null

    if (config.backend === 'github') {
      adapter = new ShardedSyncService(new GitHubBackendDriver(config))
    } else if (config.backend === 'webdav') {
      adapter = new ShardedSyncService(new WebDavBackendDriver(config))
    } else if (config.backend === 'gitlab') {
      adapter = new ShardedSyncService(new GitLabBackendDriver(config))
    } else if (config.backend === 'azure-devops') {
      adapter = new ShardedSyncService(new AzureDevOpsBackendDriver(config))
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
