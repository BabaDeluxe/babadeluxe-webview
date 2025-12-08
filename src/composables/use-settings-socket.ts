import { ref, onBeforeUnmount, inject, readonly } from 'vue'
import type { Root } from '@babadeluxe/shared'
import {
  type UserSettingWithValidation,
  getSettingDefinition,
  settingMetadata,
  type SettingKey,
  fromWire,
} from '@babadeluxe/shared'
import { LOGGER_KEY, SOCKET_MANAGER_KEY } from '@/injection-keys'
import type { ConsoleLogger } from '@simwai/utils'

export function useSettingsSocket() {
  const socketManager = inject(SOCKET_MANAGER_KEY)!
  const logger: ConsoleLogger = inject(LOGGER_KEY)!

  const settingsSocket = socketManager.settingsSocket

  const settings = ref<UserSettingWithValidation[]>([])
  const isLoading = ref(false)
  const error = ref<string | undefined>()

  const onUpdated: Root.Emission['settings:updated'] = (updatedSetting) => {
    const definition = getSettingDefinition(updatedSetting.settingKey)
    const metadata = settingMetadata[updatedSetting.settingKey as SettingKey]

    const settingWithValidation: UserSettingWithValidation = {
      settingKey: updatedSetting.settingKey,
      settingValue: updatedSetting.settingValue,
      dataType: updatedSetting.dataType,
      updatedAt: new Date(updatedSetting.updatedAt),
      category: definition?.category ?? '',
      encrypted: metadata?.encrypted ?? false,
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
    logger.error('Settings socket error:', payload.error)
  }

  // Register handlers
  settingsSocket.on('settings:updated', onUpdated)
  settingsSocket.on('settings:deleted', onDeleted)
  settingsSocket.on('settings:error', onError)

  // Cleanup
  onBeforeUnmount(() => {
    settingsSocket.off('settings:updated', onUpdated)
    settingsSocket.off('settings:deleted', onDeleted)
    settingsSocket.off('settings:error', onError)
  })

  const loadSettings = async (): Promise<void> => {
    const waitResult = await settingsSocket.waitForConnection()
    if (waitResult.isErr()) {
      throw waitResult.error
    }

    return new Promise((resolve, reject) => {
      isLoading.value = true
      error.value = undefined

      const timeoutId = setTimeout(() => {
        logger.error('Acknowledgment timeout on settings socket')
        reject(new Error('Server acknowledgment timeout'))
      }, 5000)

      settingsSocket.emit('settings:getAll', (response) => {
        clearTimeout(timeoutId)
        isLoading.value = false

        if (response.success) {
          settings.value = response.data.map(fromWire)
          resolve()
        } else {
          error.value = response.error
          reject(new Error(response.error ?? 'Unknown error'))
        }
      })
    })
  }

  const upsertSetting = async (
    settingKey: string,
    settingValue: unknown,
    dataType: 'string' | 'number' | 'boolean'
  ): Promise<void> => {
    const waitResult = await settingsSocket.waitForConnection()
    if (waitResult.isErr()) {
      throw waitResult.error
    }

    return new Promise((resolve, reject) => {
      settingsSocket.emit('settings:upsert', { settingKey, settingValue, dataType }, (response) => {
        if (response.success) {
          resolve()
        } else {
          error.value = response.error
          reject(new Error(response.error ?? 'Unknown error'))
        }
      })
    })
  }

  const deleteSetting = async (settingKey: string): Promise<void> => {
    const waitResult = await settingsSocket.waitForConnection()
    if (waitResult.isErr()) {
      throw waitResult.error
    }

    return new Promise((resolve, reject) => {
      settingsSocket.emit('settings:delete', { settingKey }, (response) => {
        if (response.success) {
          resolve()
        } else {
          error.value = response.error
          reject(new Error(response.error ?? 'Unknown error'))
        }
      })
    })
  }

  return {
    settings: readonly(settings),
    isLoading: readonly(isLoading),
    error: readonly(error),
    loadSettings,
    upsertSetting,
    deleteSetting,
    isConnected: settingsSocket.isConnected,
  }
}
