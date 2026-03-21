import { ref, onBeforeUnmount, readonly, computed, watch } from 'vue'
import type { UserSettingWire } from '@babadeluxe/shared'
import { type Root, type UserSettingWithValidation } from '@babadeluxe/shared'

import { mergePartialUpdate } from '@/merge-settings'
import { socketTimeoutMs } from '@/constants'
import { err, ok, type Result } from 'neverthrow'
import { NetworkError, SocketError } from '@/errors'
import { useSocketManager } from '@/composables/use-socket-manager'
import { emitWithTimeout } from '@/emit-with-timeout'
import { fromWire } from '@/settings-utils'

export function useSettingsSocket() {
  const { socketManagerRef } = useSocketManager()

  const settings = ref<UserSettingWithValidation[]>([])
  const isLoading = ref(false)
  const error = ref<string | undefined>()

  const abortController = new AbortController()
  onBeforeUnmount(() => {
    abortController.abort()
  })

  // Socket ref (same pattern as subscription composable)
  const settingsSocketRef = computed(() => socketManagerRef.value?.settingsSocket)

  // --- Event listeners using pure merge function ---
  const onUpdated: Root.Emission['settings:updated'] = (updatedPartial) => {
    settings.value = mergePartialUpdate(settings.value, updatedPartial)
  }

  const onDeleted: Root.Emission['settings:deleted'] = (payload) => {
    settings.value = settings.value.filter((s) => s.settingKey !== payload.settingKey)
  }

  const onError: Root.Emission['settings:error'] = (payload) => {
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

  // --- Helper to ensure connected ---
  const ensureConnected = async (): Promise<Result<true, NetworkError>> => {
    const socket = settingsSocketRef.value
    if (!socket) return err(new SocketError('Settings socket not connected'))

    const waitResult = await socket.waitForConnection()
    if (waitResult.isErr()) {
      const mappedError =
        waitResult.error instanceof NetworkError
          ? waitResult.error
          : new NetworkError('Connection failed', waitResult.error)
      return err(mappedError)
    }

    return ok(true)
  }

  // --- Public methods ---
  const loadSettings = async (): Promise<Result<void, NetworkError>> => {
    isLoading.value = true
    error.value = undefined

    const connectionResult = await ensureConnected()
    if (connectionResult.isErr()) {
      error.value = connectionResult.error.message
      isLoading.value = false
      return err(connectionResult.error)
    }

    const emitResult = await emitWithTimeout({
      socket: settingsSocketRef, // pass ref, not .value
      actionName: 'settings:getAll',
      timeoutMs: socketTimeoutMs.settings,
    })

    if (emitResult.isErr()) {
      const mappedError = new NetworkError('Failed to load settings', emitResult.error)
      error.value = mappedError.message
      isLoading.value = false
      return err(mappedError)
    }

    settings.value = fromWire(emitResult.value as UserSettingWire[])
    isLoading.value = false
    return ok(undefined)
  }

  const upsertSetting = async (
    settingKey: string,
    settingValue: unknown,
    dataType: 'string' | 'number' | 'boolean'
  ): Promise<Result<void, NetworkError>> => {
    error.value = undefined
    const payload: Parameters<Root.Actions['settings:upsert']>[0] = {
      settingKey,
      settingValue,
      dataType,
    }

    const socket = settingsSocketRef.value
    if (!socket) return err(new SocketError('Socket not connected'))

    const emitResult = await emitWithTimeout({
      socket: settingsSocketRef,
      actionName: 'settings:upsert',
      payload,
      timeoutMs: socketTimeoutMs.settings,
    })

    if (emitResult.isErr()) {
      const mappedError = new NetworkError('Failed to upsert setting', emitResult.error)
      error.value = mappedError.message
      return err(mappedError)
    }

    return ok(undefined)
  }

  const deleteSetting = async (settingKey: string): Promise<Result<void, NetworkError>> => {
    error.value = undefined
    const payload: Parameters<Root.Actions['settings:delete']>[0] = { settingKey }

    const socket = settingsSocketRef.value
    if (!socket) return err(new SocketError('Socket not connected'))

    const emitResult = await emitWithTimeout({
      socket: settingsSocketRef,
      actionName: 'settings:delete',
      payload,
      timeoutMs: socketTimeoutMs.settings,
    })

    if (emitResult.isErr()) {
      const mappedError = new NetworkError('Failed to delete setting', emitResult.error)
      error.value = mappedError.message
      return err(mappedError)
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
    isConnected: computed(() => settingsSocketRef.value?.isConnected ?? false),
  }
}
