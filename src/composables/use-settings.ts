import { ref, onBeforeUnmount, readonly, computed, watch, inject } from 'vue'
import { type UserSettingWithValidation } from '@babadeluxe/shared'
import { mergePartialUpdate } from '@/merge-settings'
import { isOfflineMode } from '@/env-validator'
import { err, ok, type Result } from 'neverthrow'
import { type NetworkError, SocketError } from '@/errors'
import { useSocketManager } from '@/composables/use-socket-manager'
import { APP_DB_KEY, SOCKET_MANAGER_KEY } from '@/injection-keys'
import { SocketSettingsRepository } from '@/repositories/socket-settings-repository'
import { DexieSettingsRepository } from '@/repositories/dexie-settings-repository'
import type { SettingsRepository } from '@/repositories/settings-repository'

export function useSettings() {
  const { socketManagerRef } = useSocketManager()
  const db = inject(APP_DB_KEY)!

  const isOffline = isOfflineMode()
  const repository: SettingsRepository = isOffline
    ? new DexieSettingsRepository(db)
    : new SocketSettingsRepository(socketManagerRef)

  const settings = ref<UserSettingWithValidation[]>([])
  const isLoading = ref(false)
  const error = ref<string | undefined>()

  const abortController = new AbortController()
  onBeforeUnmount(() => {
    abortController.abort()
  })

  // Socket listener for updates (only in online mode)
  if (!isOffline) {
    const settingsSocketRef = computed(() => socketManagerRef.value?.settingsSocket)

    const onUpdated = (updatedPartial: any) => {
      settings.value = mergePartialUpdate(settings.value, updatedPartial)
    }

    const onDeleted = (payload: { settingKey: string }) => {
      settings.value = settings.value.filter((s) => s.settingKey !== payload.settingKey)
    }

    const onError = (payload: { error: string }) => {
      error.value = payload.error
    }

    watch(
      settingsSocketRef,
      (newSocket, oldSocket) => {
        if (oldSocket) {
          oldSocket.off('settings:updated', onUpdated)
          oldSocket.off('settings:deleted', onDeleted)
          oldSocket.off('settings:error', onError)
        }
        if (!newSocket) return
        newSocket.on('settings:updated', onUpdated)
        newSocket.on('settings:deleted', onDeleted)
        newSocket.on('settings:error', onError)
      },
      { immediate: true }
    )
  }

  // --- Public methods ---
  const loadSettings = async (): Promise<Result<void, NetworkError>> => {
    isLoading.value = true
    error.value = undefined

    const result = await repository.loadSettings()

    if (result.isErr()) {
      error.value = result.error.message
      isLoading.value = false
      return err(result.error)
    }

    settings.value = result.value
    isLoading.value = false
    return ok(undefined)
  }

  const upsertSetting = async (
    settingKey: string,
    settingValue: unknown,
    dataType: 'string' | 'number' | 'boolean'
  ): Promise<Result<void, NetworkError>> => {
    error.value = undefined
    const result = await repository.upsertSetting(settingKey, settingValue, dataType)

    if (result.isErr()) {
      error.value = result.error.message
      return err(result.error)
    }

    // Update local state immediately for offline mode
    if (isOffline) {
      settings.value = mergePartialUpdate(settings.value, {
        settingKey,
        settingValue,
        dataType,
        updatedAt: new Date().toISOString(),
      })
    }

    return ok(undefined)
  }

  const deleteSetting = async (settingKey: string): Promise<Result<void, NetworkError>> => {
    error.value = undefined
    const result = await repository.deleteSetting(settingKey)

    if (result.isErr()) {
      error.value = result.error.message
      return err(result.error)
    }

    if (isOffline) {
      settings.value = settings.value.filter((s) => s.settingKey !== settingKey)
    }

    return ok(undefined)
  }

  return {
    settings: readonly(settings),
    isLoading: readonly(isLoading),
    error: readonly(error),
    loadSettings,
    upsertSetting,
    deleteSetting,
    isConnected: computed(() => (isOffline ? true : socketManagerRef.value?.settingsSocket?.isConnected ?? false)),
  }
}
