<template>
  <section
    id="settings"
    data-testid="settings-container"
    class="flex-1 flex flex-col gap-6 p-4 sm:p-6 max-w-4xl mx-auto w-full"
  >
    <BaseAlertList :banners="alertBanners" />

    <div
      v-if="hasComponentError"
      data-testid="component-error"
      class="flex-1 flex flex-col items-center justify-center gap-4 text-center"
    >
      <p class="text-error text-lg">Something went wrong with the settings view.</p>
      <BaseButton @click="handleReload"> Reload Page </BaseButton>
    </div>

    <div
      v-else-if="isLoadingSettings"
      data-testid="loading-state"
      class="flex-1 flex items-center justify-center"
    >
      <BaseSpinner
        size="medium"
        message="Loading settings..."
      />
    </div>

    <template v-else>
      <section
        v-if="generalSettings.length > 0"
        data-testid="general-settings-section"
        class="flex flex-col gap-4"
      >
        <h2 class="text-xl font-onest font-semibold text-deepText">General Settings</h2>
        <div
          v-for="setting in generalSettings"
          :key="setting.settingKey"
          class="flex flex-col gap-1"
        >
          <SettingsField
            :setting="setting"
            :field-name="setting.settingKey"
            :name="setting.settingKey"
            @field-changed="handleFieldChange"
          />
          <div
            v-if="fieldStates[setting.settingKey]?.error"
            role="alert"
            :aria-label="`Error for ${setting.settingKey}`"
            class="text-error text-xs"
          >
            {{ fieldStates[setting.settingKey]?.error }}
          </div>
        </div>
      </section>

      <section
        data-testid="api-providers-section"
        class="flex flex-col gap-4"
      >
        <h3 class="text-lg font-onest font-semibold text-deepText">API Keys</h3>
        <div
          v-for="provider in apiProviders"
          :key="provider.key"
          class="flex flex-col gap-1"
        >
          <BaseInput
            v-model="fieldStates[provider.key].value"
            type="password"
            :label="provider.name"
            :placeholder="`Enter ${provider.name} API key...`"
            :is-required="provider.required"
            :validation-state="fieldStates[provider.key].status"
            :error="fieldStates[provider.key].error"
            :is-toggleable="true"
            :data-testid="`api-${provider.key}`"
            @update:model-value="handleApiKeyInput(provider.key, $event)"
          />
        </div>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, onErrorCaptured, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { ResultAsync } from 'neverthrow'
import { getSettingDefinition, validateSetting } from '@babadeluxe/shared'
import { getApiProviders } from '@/settings-utils'
import { useSettingsSocket } from '@/composables/use-settings-socket'
import { useModelsSocket } from '@/composables/use-models-socket'
import SettingsField from '@/components/SettingsField.vue'
import BaseAlertList from '@/components/BaseAlertList.vue'
import BaseSpinner from '@/components/BaseSpinner.vue'
import BaseInput from '@/components/BaseInput.vue'
import BaseButton from '@/components/BaseButton.vue'
import { API_KEY_VALIDATOR_KEY, LOGGER_KEY, SUPABASE_CLIENT_KEY } from '@/injection-keys'
import {
  ValidationError,
  RateLimitError,
  AuthError,
  InitializationError,
  NetworkError,
} from '@/errors'
import { safeInject } from '@/safe-inject'

type FieldStatus = 'idle' | 'validating' | 'valid' | 'invalid'

type FieldState = {
  value: string
  status: FieldStatus
  error?: string
}

const logger = safeInject(LOGGER_KEY)
const validator = safeInject(API_KEY_VALIDATOR_KEY)
const supabase = safeInject(SUPABASE_CLIENT_KEY)

const { settings, upsertSetting, loadSettings } = useSettingsSocket()
const { reloadModels } = useModelsSocket()
const apiProviders = getApiProviders()

const fieldStates = ref<Record<string, FieldState>>(
  Object.fromEntries(
    apiProviders.map((provider) => [
      provider.key,
      {
        value: '',
        status: 'idle' as FieldStatus,
      },
    ])
  )
)

const isLoadingSettings = ref(true)
const loadError = ref<string | undefined>()
const isDebounceStopped = ref(false)
const modelsReloadWarning = ref<string | undefined>()
const currentUserId = ref<string>()

const hasComponentError = ref(false)
const handleReload = () => {
  window.location.reload()
}

onErrorCaptured((err, instance, info) => {
  logger.error('Settings component crashed', {
    vueInfo: info,
    componentName: instance?.$options?.name,
    userId: currentUserId.value,
    error: err,
  })

  hasComponentError.value = true
  return false
})

const generalSettings = computed(() =>
  settings.value.filter((setting) => !setting.settingKey.startsWith('apiKey'))
)

const alertBanners = computed(() => {
  const banners = []

  if (loadError.value) {
    banners.push({
      id: 'load-error',
      message: loadError.value,
      type: 'error' as const,
      isDismissible: false,
    })
  }

  if (modelsReloadWarning.value) {
    banners.push({
      id: 'models-reload-warning',
      message: modelsReloadWarning.value,
      type: 'warning' as const,
      isDismissible: true,
      onClose: () => {
        modelsReloadWarning.value = undefined
      },
    })
  }

  return banners
})

const getSettingByKey = (key: string) =>
  settings.value.find((setting) => setting.settingKey === key)

const hydrateFieldStates = () => {
  for (const provider of apiProviders) {
    const setting = getSettingByKey(provider.key)

    if (!setting?.settingValue || !fieldStates.value[provider.key]) continue

    fieldStates.value[provider.key].value = String(setting.settingValue)
    fieldStates.value[provider.key].status = 'idle'
  }
}

watch(
  settings,
  () => {
    if (isLoadingSettings.value) return
    hydrateFieldStates()
  },
  { deep: true }
)

const updateFieldStatus = (key: string, status: FieldStatus, error?: string) => {
  if (!fieldStates.value[key]) return

  fieldStates.value[key] = {
    ...fieldStates.value[key],
    status,
    error,
  }
}

const validateAndSaveApiKey = async (provider: string, apiKey: string) => {
  if (isLoadingSettings.value) return

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

    if (error) {
      logger.error('API key validation failed', {
        userId: currentUserId.value,
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
  upsertSetting(provider, apiKey, definition.dataType)

  const reloadModelsResult = await reloadModels()
  if (reloadModelsResult.isErr()) {
    logger.error('Failed to reload models after API key validation', {
      userId: currentUserId.value,
      provider,
      error: reloadModelsResult.error,
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

const handleFieldChange = async (fieldName: string, value: unknown) => {
  if (isLoadingSettings.value) return

  const setting = getSettingByKey(fieldName)
  if (!setting) return

  const validationResult = validateSetting(fieldName, value)

  if (!validationResult.success) {
    updateFieldStatus(fieldName, 'invalid', validationResult.error)
    return
  }

  updateFieldStatus(fieldName, 'valid')
  await upsertSetting(fieldName, value, setting.dataType)
}

const fetchUserId = async (): Promise<void> => {
  const getUserResult = await ResultAsync.fromPromise(supabase.auth.getUser(), (unknownError) => {
    if (unknownError instanceof Error) {
      return new AuthError(unknownError.message, unknownError)
    }
    return new AuthError('Failed to fetch user', unknownError)
  })

  getUserResult.match(
    (response) => {
      if (response.data.user?.id) {
        currentUserId.value = response.data.user.id
      }
    },
    (fetchError) => {
      logger.error('Failed to fetch user details for settings view', {
        error: fetchError,
      })
    }
  )
}

onMounted(async () => {
  await fetchUserId()

  const result = await ResultAsync.fromPromise(loadSettings(), (unknownError) => {
    if (unknownError instanceof Error) {
      return new InitializationError(unknownError.message, unknownError)
    }
    return new InitializationError('Failed to load settings', unknownError)
  })

  result.match(
    () => {
      hydrateFieldStates()
      isLoadingSettings.value = false
    },
    (loadErr) => {
      logger.error('Failed to load settings', {
        userId: currentUserId.value,
        error: loadErr,
      })
      loadError.value = 'Settings could not be loaded. Please refresh the page.'
      isLoadingSettings.value = false
    }
  )
})

onBeforeUnmount(() => {
  isDebounceStopped.value = true
})
</script>
