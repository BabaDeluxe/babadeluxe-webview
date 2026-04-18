import { type Ref, ref, onBeforeUnmount } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { getSettingDefinition, validateSetting } from '@babadeluxe/shared'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ApiKeyValidator, IApiKeyValidator } from '@/api-key-validator'
import type { AbstractLogger } from '@/logger'
import { ValidationError, RateLimitError, NetworkError } from '@/errors'
import { getApiProviders } from '@/settings-utils'
import type { Result } from 'neverthrow'

export type FieldStatus = 'idle' | 'validating' | 'valid' | 'invalid'

export type FieldState = {
  value: string
  status: FieldStatus
  error?: string
}

export function useApiKeyManagement<T, E>(
  validator: IApiKeyValidator,
  logger: AbstractLogger,
  upsertSetting: (
    key: string,
    value: unknown,
    type: 'string' | 'number' | 'boolean'
  ) => Promise<void>,
  reloadModels: () => Promise<Result<T, E>>,
  getCurrentUserId: () => string | undefined,
  settings: Readonly<
    Ref<
      readonly {
        readonly settingKey: string
        readonly settingValue: Readonly<unknown>
        readonly dataType: 'string' | 'number' | 'boolean'
        readonly updatedAt: Date
        readonly category: string
        readonly encrypted: boolean
        readonly required: boolean
        readonly description: string
        readonly minLength?: number | undefined
        readonly maxLength?: number | undefined
        readonly minValue?: number | undefined
        readonly maxValue?: number | undefined
      }[],
      readonly {
        readonly settingKey: string
        readonly settingValue: Readonly<unknown>
        readonly dataType: 'string' | 'number' | 'boolean'
        readonly updatedAt: Date
        readonly category: string
        readonly encrypted: boolean
        readonly required: boolean
        readonly description: string
        readonly minLength?: number | undefined
        readonly maxLength?: number | undefined
        readonly minValue?: number | undefined
        readonly maxValue?: number | undefined
      }[]
    >
  >
) {
  const apiProviders = getApiProviders()
  const isDebounceStopped = ref(false)
  const modelsReloadWarning = ref<string | undefined>()

  const defaultFieldStates = Object.fromEntries(
    apiProviders.map((provider) => [
      provider.key,
      {
        value: '',
        status: 'idle' as FieldStatus,
      },
    ])
  )
  const fieldStates = ref<Record<string, FieldState>>(defaultFieldStates)

  const updateFieldStatus = (key: string, status: FieldStatus, error?: string) => {
    if (!fieldStates.value[key]) return
    fieldStates.value[key] = {
      ...fieldStates.value[key],
      status,
      error,
    }
  }

  const getSettingByKey = (key: string) =>
    settings.value.find((setting) => setting.settingKey === key)

  const hydrateFieldStates = () => {
    for (const provider of apiProviders) {
      const setting = getSettingByKey(provider.key)
      if (!setting?.settingValue || !fieldStates.value[provider.key]) continue

      fieldStates.value[provider.key].value = String(setting.settingValue)
      // Only reset to idle if we aren't currently typing/validating
      if (fieldStates.value[provider.key].status === 'idle') {
        fieldStates.value[provider.key].status = 'idle'
      }
    }
  }

  const validateAndSaveApiKey = async (provider: string, apiKey: string) => {
    const definition = getSettingDefinition(provider)
    if (!definition) return

    const validationResult = validateSetting(provider, apiKey)
    if (!validationResult.success) {
      updateFieldStatus(provider, 'invalid', validationResult.error)
      return
    }

    updateFieldStatus(provider, 'validating')

    const providerName = provider.replace('apiKey', '').toLowerCase()
    const result = await validator.validate(providerName, apiKey)

    if (!result || result.isErr()) {
      const error = result?.error
      const userId = getCurrentUserId()

      if (error) {
        logger.error('API key validation failed', {
          userId,
          provider,
          error,
        })
        if (error instanceof ValidationError) {
          updateFieldStatus(provider, 'invalid', 'The provided API key is not valid.')
        } else if (error instanceof RateLimitError) {
          updateFieldStatus(provider, 'invalid', 'Rate limited. Please wait a moment.')
        } else if (error instanceof NetworkError) {
          updateFieldStatus(provider, 'invalid', 'Network error. Check connection and retry.')
        } else {
          updateFieldStatus(provider, 'invalid', 'Validation failed. Please try again.')
        }
      } else {
        updateFieldStatus(provider, 'invalid', 'Validation failed')
      }
      return
    }

    updateFieldStatus(provider, 'valid')
    await upsertSetting(provider, apiKey, definition.dataType)

    // Reload models to reflect new key capabilities
    try {
      const reloadResult = await reloadModels()
      if (
        reloadResult &&
        typeof reloadResult === 'object' &&
        'isErr' in reloadResult &&
        reloadResult.isErr()
      ) {
        throw reloadResult.error
      }
    } catch (err) {
      logger.error('Failed to reload models after API key validation', {
        userId: getCurrentUserId(),
        provider,
        error: err,
      })
      modelsReloadWarning.value =
        'API key saved, but models could not be updated. Please reload the page.'
    }
  }

  const debouncedValidate = useDebounceFn(
    async (provider: string, apiKey: string) => {
      if (isDebounceStopped.value) return
      await validateAndSaveApiKey(provider, apiKey)
    },
    500,
    { rejectOnCancel: false }
  )

  const handleApiKeyInput = (provider: string, value: string | number) => {
    const apiKey = String(value).trim()

    fieldStates.value[provider].value = apiKey
    updateFieldStatus(provider, 'idle')

    if (apiKey) {
      debouncedValidate(provider, apiKey)
    }
  }

  onBeforeUnmount(() => {
    isDebounceStopped.value = true
  })

  return {
    apiProviders,
    fieldStates,
    modelsReloadWarning,
    hydrateFieldStates,
    handleApiKeyInput,
  }
}
