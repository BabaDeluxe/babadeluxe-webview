import { ref, onBeforeUnmount, readonly, computed, watch } from 'vue'
import { type Root, type UserSettingWithValidation, getSettingDefinition } from '@babadeluxe/shared'
import { fromWire } from '@/settings-utils'
import { socketTimeoutMs } from '@/constants'
import { ResultAsync, err, ok, type Result } from 'neverthrow'
import type { SocketConnectionError } from '@/errors'
import { NetworkError, SocketError } from '@/errors'
import { useSocketManager } from '@/composables/use-socket-manager'

type SettingsGetAllResponse = Parameters<Parameters<Root.Actions['settings:getAll']>[0]>[0]

type SettingsUpsertPayload = Parameters<Root.Actions['settings:upsert']>[0]
type SettingsUpsertResponse = Parameters<Parameters<Root.Actions['settings:upsert']>[1]>[0]

type SettingsDeletePayload = Parameters<Root.Actions['settings:delete']>[0]
type SettingsDeleteResponse = Parameters<Parameters<Root.Actions['settings:delete']>[1]>[0]

export function useSettingsSocket() {
  const { socketManagerRef } = useSocketManager()

  const settingsSocketRef = computed(() => socketManagerRef.value?.settingsSocket)

  const settings = ref<UserSettingWithValidation[]>([])
  const isLoading = ref(false)
  const error = ref<string | undefined>()

  const onUpdated: Root.Emission['settings:updated'] = (updatedSetting) => {
    const definition = getSettingDefinition(updatedSetting.settingKey)

    const settingWithValidation: UserSettingWithValidation = {
      settingKey: updatedSetting.settingKey,
      settingValue: updatedSetting.settingValue,
      dataType: updatedSetting.dataType as 'string' | 'number' | 'boolean',
      updatedAt: new Date(updatedSetting.updatedAt),
      category: definition?.category ?? '',
      encrypted: definition?.encrypted ?? false,
      required: definition?.required ?? false,
      description: definition?.description ?? '',
      minLength: definition?.minLength,
      maxLength: definition?.maxLength,
      minValue: definition?.minValue,
      maxValue: definition?.maxValue,
    }

    const index = settings.value.findIndex((s) => s.settingKey === updatedSetting.settingKey)
    if (index === -1) settings.value.push(settingWithValidation)
    else settings.value[index] = settingWithValidation
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

  onBeforeUnmount(() => {
    if (!settingsSocketRef.value) return

    settingsSocketRef.value.off('settings:updated', onUpdated)
    settingsSocketRef.value.off('settings:deleted', onDeleted)
    settingsSocketRef.value.off('settings:error', onError)
  })

  const loadSettings = async (): Promise<Result<void, SocketConnectionError>> => {
    const socket = settingsSocketRef.value
    if (!socket) {
      const socketError = new SocketError('Settings socket not connected')
      error.value = socketError.message
      return err(socketError)
    }

    const waitResult = await socket.waitForConnection()
    if (waitResult.isErr()) {
      const rootError = waitResult.error
      const mappedError =
        rootError instanceof NetworkError
          ? rootError
          : new NetworkError('Settings socket connection failed', rootError)
      error.value = mappedError.message
      return err(mappedError)
    }

    const result = await ResultAsync.fromPromise(
      new Promise<void>((resolve, reject) => {
        isLoading.value = true
        error.value = undefined

        const timeoutId = setTimeout(() => {
          reject(new NetworkError('Failed to load settings: timeout'))
        }, socketTimeoutMs.settings)

        socket.emit('settings:getAll', (response: SettingsGetAllResponse) => {
          clearTimeout(timeoutId)
          isLoading.value = false

          if (response.success) {
            settings.value = response.data.map(fromWire)
            resolve()
            return
          }

          const errorMessage = response.error ?? 'Failed to load settings'
          const networkError = new NetworkError(errorMessage)
          error.value = networkError.message
          reject(networkError)
        })
      }),
      (unknownError): NetworkError =>
        unknownError instanceof NetworkError
          ? unknownError
          : new NetworkError('Failed to load settings', unknownError)
    )

    if (result.isErr()) {
      return err(result.error)
    }

    return ok(undefined)
  }

  const upsertSetting = async (
    settingKey: string,
    settingValue: unknown,
    dataType: 'string' | 'number' | 'boolean'
  ): Promise<Result<void, SocketConnectionError>> => {
    const socket = settingsSocketRef.value
    if (!socket) {
      const socketError = new SocketError('Settings socket not connected')
      error.value = socketError.message
      return err(socketError)
    }

    const waitResult = await socket.waitForConnection()
    if (waitResult.isErr()) {
      const rootError = waitResult.error
      const mappedError =
        rootError instanceof NetworkError
          ? rootError
          : new NetworkError('Settings socket connection failed', rootError)
      error.value = mappedError.message
      return err(mappedError)
    }

    const payload: SettingsUpsertPayload = { settingKey, settingValue, dataType }

    const result = await ResultAsync.fromPromise(
      new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new NetworkError('Failed to update setting: timeout'))
        }, socketTimeoutMs.settings)

        socket.emit('settings:upsert', payload, (response: SettingsUpsertResponse) => {
          clearTimeout(timeoutId)

          if (response.success) {
            resolve()
            return
          }

          const errorMessage = response.error ?? 'Failed to update setting'
          const networkError = new NetworkError(errorMessage)
          error.value = networkError.message
          reject(networkError)
        })
      }),
      (unknownError): NetworkError =>
        unknownError instanceof NetworkError
          ? unknownError
          : new NetworkError('Failed to update setting', unknownError)
    )

    if (result.isErr()) {
      return err(result.error)
    }

    return ok(undefined)
  }

  const deleteSetting = async (
    settingKey: string
  ): Promise<Result<void, SocketConnectionError>> => {
    const socket = settingsSocketRef.value
    if (!socket) {
      const socketError = new SocketError('Settings socket not connected')
      error.value = socketError.message
      return err(socketError)
    }

    const waitResult = await socket.waitForConnection()
    if (waitResult.isErr()) {
      const rootError = waitResult.error
      const mappedError =
        rootError instanceof NetworkError
          ? rootError
          : new NetworkError('Settings socket connection failed', rootError)
      error.value = mappedError.message
      return err(mappedError)
    }

    const payload: SettingsDeletePayload = { settingKey }

    const result = await ResultAsync.fromPromise(
      new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new NetworkError('Failed to delete setting: timeout'))
        }, socketTimeoutMs.settings)

        socket.emit('settings:delete', payload, (response: SettingsDeleteResponse) => {
          clearTimeout(timeoutId)

          if (response.success) {
            resolve()
            return
          }

          const errorMessage = response.error ?? 'Failed to delete setting'
          const networkError = new NetworkError(errorMessage)
          error.value = networkError.message
          reject(networkError)
        })
      }),
      (unknownError): NetworkError =>
        unknownError instanceof NetworkError
          ? unknownError
          : new NetworkError('Failed to delete setting', unknownError)
    )

    if (result.isErr()) {
      return err(result.error)
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
