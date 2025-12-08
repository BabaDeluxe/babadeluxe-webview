import { ref, onBeforeUnmount, inject, readonly } from 'vue'
import type { Settings } from '@babadeluxe/shared'
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

  const onUpdated: Settings.Emission['updated'] = (updatedSetting) => {
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

  const onDeleted: Settings.Emission['deleted'] = (payload) => {
    settings.value = settings.value.filter((s) => s.settingKey !== payload.settingKey)
  }

  const onError: Settings.Emission['error'] = (payload) => {
    error.value = payload.error
    logger.error('Settings socket error:', payload.error)
  }

  // Register handlers
  settingsSocket.on('updated', onUpdated)
  settingsSocket.on('deleted', onDeleted)
  settingsSocket.on('error', onError)

  // Cleanup
  onBeforeUnmount(() => {
    settingsSocket.off('updated', onUpdated)
    settingsSocket.off('deleted', onDeleted)
    settingsSocket.off('error', onError)
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

      settingsSocket.emit('getAll', (response) => {
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
      settingsSocket.emit('upsert', { settingKey, settingValue, dataType }, (response) => {
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
      settingsSocket.emit('delete', { settingKey }, (response) => {
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
