<template>
  <section
    id="settings"
    data-testid="settings-container"
    class="flex-1 flex flex-col gap-6 p-4 sm:p-6 max-w-4xl mx-auto w-full"
  >
    <div
      v-if="apiKeyValidator.hasError"
      data-testid="component-error"
      class="flex-1 flex flex-col items-center justify-center gap-4 text-center"
    >
      <p class="text-error text-lg">Something went wrong with the settings view.</p>
      <BaseButton
        variant="secondary"
        @click="handleReload"
        >Reload Page</BaseButton
      >
    </div>

    <div
      v-else-if="loadError"
      data-testid="load-error-state"
      class="flex-1 flex flex-col items-center justify-center gap-4 text-center"
    >
      <p class="text-error text-lg">{{ loadError }}</p>
      <BaseButton
        variant="secondary"
        @click="handleRetryLoad"
      >
        Retry
      </BaseButton>
    </div>

    <div
      v-else-if="!apiKeyValidator.isReady || isLoadingSettings"
      data-testid="loading-state"
      class="flex-1 flex items-center justify-center"
    >
      <BaseSpinner
        size="medium"
        message="Loading settings..."
      />
    </div>

    <template v-else-if="isReady">
      <AppearanceSection
        :is-dark="isDark"
        @toggle-theme="handleThemeToggle"
      />

      <GeneralSettingsSection
        :settings="generalSettings"
        :field-states="fieldStates"
        @field-changed="handleFieldChange"
      />

      <PromptBehaviourSection
        :mode="promptInjectionMode"
        :interval="promptInjectionInterval"
        :position="promptInjectionPosition"
        :include-history="promptIncludeHistory"
        @update:mode="handleInjectionModeChange"
        @update:interval="handleIntervalChange"
        @update:position="handlePositionChange"
        @update:include-history="handleIncludeHistoryToggle"
      />

      <ModelPreferencesSection
        :available-models="availableModels"
        :get-temperature-for-model="getTemperatureForModel"
        @temperature-change="handleTemperatureChange"
        @temperature-reset="handleTemperatureReset"
      />

      <ApiKeySection
        :api-providers="apiProviders"
        :field-states="fieldStates"
        @api-key-input="handleApiKeyInput"
      />
    </template>
  </section>
</template>

<script setup lang="ts">
import { useToastStore } from '@/stores/use-toast-store'
import { useTheme } from '@/composables/use-theme'
import { useOllamaSettings } from '@/composables/use-ollama-settings'
import { toUserMessage } from '@/error-mapper'
import BaseSpinner from '@/components/BaseSpinner.vue'
import BaseButton from '@/components/BaseButton.vue'
import AppearanceSection from '@/components/settings/AppearanceSection.vue'
import GeneralSettingsSection from '@/components/settings/GeneralSettingsSection.vue'
import PromptBehaviourSection from '@/components/settings/PromptBehaviourSection.vue'
import ModelPreferencesSection from '@/components/settings/ModelPreferencesSection.vue'
import ApiKeySection from '@/components/settings/ApiKeySection.vue'
import { API_KEY_VALIDATOR_KEY, LOGGER_KEY, SUPABASE_CLIENT_KEY } from '@/injection-keys'
import { AuthError, InitializationError } from '@/errors'
import { safeInject } from '@/safe-inject'
import { ResultAsync } from 'neverthrow'
import { computed, onMounted, ref } from 'vue'
import type { ModelTemperatures } from '@babadeluxe/shared'
import {
  promptInjectionDefaults,
  resetModelTemperature,
  setModelTemperature,
  validateSetting,
} from '@babadeluxe/shared'
import { useModelsSocket } from '@/composables/use-models-socket'
import { useSettings } from '@/composables/use-settings'
import { useApiKeyManagement } from '@/composables/use-api-key-management'
import { isOfflineMode } from '@/env-validator'
import type { IApiKeyValidator } from '@/api-key-validator'
import type {
  PromptInjectionMode,
  PromptInjectionPosition,
} from '@/services/prompt-injection-service'

const logger = safeInject(LOGGER_KEY)
const apiKeyValidator = safeInject(API_KEY_VALIDATOR_KEY)
const supabase = safeInject(SUPABASE_CLIENT_KEY)
const toasts = useToastStore()

const { settings, upsertSetting, loadSettings } = useSettings()
const { reloadModels, groupedModels } = useModelsSocket()
const { isDark, toggleDark } = useTheme()
useOllamaSettings()

const currentUserId = ref<string>()

// isReady is the single runtime gate: true only after apiKeyValidator.value.value
// is fully resolved (non-undefined). The `as IApiKeyValidator` assertion below is
// therefore safe — useApiKeyManagement and every template branch that consumes
// resolvedValidator are unreachable while isReady is false.
const isReady = computed(() => apiKeyValidator.isReady && apiKeyValidator.value !== undefined)

const resolvedValidator = computed(() => apiKeyValidator.value as IApiKeyValidator)

const { apiProviders, fieldStates, hydrateFieldStates, handleApiKeyInput } = useApiKeyManagement(
  resolvedValidator,
  logger,
  upsertSettingWrapper,
  reloadModels,
  () => currentUserId.value,
  settings
)

const updateFieldStatus = (
  key: string,
  status: 'valid' | 'invalid' | 'validating' | 'idle',
  error?: string
) => {
  if (fieldStates.value[key]) {
    fieldStates.value[key].status = status
    fieldStates.value[key].error = error
  }
}

const isLoadingSettings = ref(true)
const loadError = ref<string | undefined>()

const getSettingValue = <T,>(key: string, fallback: T): T => {
  const s = settings.value.find((x) => x.settingKey === key)
  return s !== undefined ? (s.settingValue as T) : fallback
}

const promptInjectionMode = computed<PromptInjectionMode>(() =>
  getSettingValue('promptInjectionMode', promptInjectionDefaults.mode)
)
const promptInjectionInterval = computed<number>(() =>
  getSettingValue('promptInjectionInterval', promptInjectionDefaults.interval)
)
const promptInjectionPosition = computed<PromptInjectionPosition>(() =>
  getSettingValue('promptInjectionPosition', promptInjectionDefaults.position)
)
const promptIncludeHistory = computed<boolean>(() =>
  getSettingValue('promptIncludeHistory', promptInjectionDefaults.includeHistory)
)

const handleInjectionModeChange = async (mode: PromptInjectionMode) => {
  await upsertSetting('promptInjectionMode', mode, 'string')
}

const handleIntervalChange = async (value: number) => {
  const validation = validateSetting('promptInjectionInterval', value)
  if (!validation.success) return
  await upsertSetting('promptInjectionInterval', value, 'number')
}

const handlePositionChange = async (pos: PromptInjectionPosition) => {
  await upsertSetting('promptInjectionPosition', pos, 'string')
}

const handleIncludeHistoryToggle = async (value: boolean) => {
  await upsertSetting('promptIncludeHistory', value, 'boolean')
}

const handleReload = () => {
  window.location.reload()
}

// const { trigger: triggerHydrate } = watchTriggerable(
//   settings,
//   () => {
//     if (!isLoadingSettings.value) hydrateFieldStates()
//   },
//   { deep: true }
// )
// const runLoadSettings = async (): Promise<void> => {
//   const result = await ResultAsync.fromPromise(loadSettings(), (unknownError) => {
//     if (unknownError instanceof Error)
//       return new InitializationError(unknownError.message, unknownError)
//     return new InitializationError('Failed to load settings', unknownError)
//   })
//   result.match(
//     () => {
//       triggerHydrate()
//       isLoadingSettings.value = false
//     },
//     (loadErr) => {
//       logger.error('Failed to load settings', { userId: currentUserId.value, error: loadErr })
//       loadError.value = 'Settings could not be loaded. Please try again.'
//       isLoadingSettings.value = false
//     }
//   )
// }
const handleRetryLoad = async () => {
  loadError.value = undefined
  isLoadingSettings.value = true

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
      logger.error('Failed to reload settings', { userId: currentUserId.value, error: loadErr })
      loadError.value = 'Settings could not be loaded. Please try again.'
      isLoadingSettings.value = false
    }
  )
}

const generalSettings = computed(() =>
  settings.value.filter(
    (setting: { settingKey: string }) => !setting.settingKey.startsWith('apiKey')
  )
)

const getSettingByKey = (key: string) =>
  settings.value.find((setting: { settingKey: string }) => setting.settingKey === key)

const handleFieldChange = async (fieldName: string, value: unknown) => {
  if (isLoadingSettings.value) return

  const setting = getSettingByKey(fieldName)
  if (!setting) return

  const validationResult = validateSetting(fieldName, value)

  if (!validationResult.success) {
    updateFieldStatus(fieldName, 'invalid', validationResult.error)
    return
  }

  updateFieldStatus(fieldName, 'validating')

  const saveResult = await upsertSetting(fieldName, value, setting.dataType)

  if (saveResult.isErr()) {
    updateFieldStatus(fieldName, 'invalid', toUserMessage(saveResult.error))
    logger.error('Failed to save setting', { fieldName, error: saveResult.error })
    return
  }

  updateFieldStatus(fieldName, 'valid')
  toasts.success('Setting saved')
}

const availableModels = computed(() => groupedModels.value.flatMap((group) => group.items))

const modelTemperatures = computed<ModelTemperatures>(() => {
  const s = settings.value.find(
    (setting: { settingKey: string }) => setting.settingKey === 'modelTemperatures'
  )
  return (s?.settingValue as ModelTemperatures) ?? {}
})

function getTemperatureForModel(modelValue: string): number | undefined {
  return modelTemperatures.value[modelValue]
}

async function persistTemperatures(next: ModelTemperatures): Promise<void> {
  const result = await upsertSetting('modelTemperatures', next, 'string')
  if (result.isErr()) {
    logger.error('Failed to save model temperatures', { error: result.error })
    toasts.error(toUserMessage(result.error))
  }
}

async function handleTemperatureChange(modelValue: string, value: number): Promise<void> {
  const next = setModelTemperature(modelTemperatures.value, modelValue, value)
  const validation = validateSetting('modelTemperatures', next)
  if (!validation.success) return
  await persistTemperatures(next)
}

async function handleTemperatureReset(modelValue: string): Promise<void> {
  await persistTemperatures(resetModelTemperature(modelTemperatures.value, modelValue))
}

async function upsertSettingWrapper(
  key: string,
  value: unknown,
  dataType: 'string' | 'number' | 'boolean'
): Promise<void> {
  const result = await upsertSetting(key, value, dataType)

  if (result.isErr()) {
    logger.error('Failed to save setting via API key management', { key, error: result.error })
    toasts.error(toUserMessage(result.error))
  }
}

const handleThemeToggle = async () => {
  toggleDark()
  const newValue = isDark.value ? 'dark' : 'light'
  // Optimistic — visual state is already applied; persist in background without blocking.
  await upsertSetting('theme', newValue, 'string')
}

const fetchUserId = async (): Promise<void> => {
  if (isOfflineMode()) {
    currentUserId.value = 'offline-user'
    return
  }

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
      loadError.value = 'Settings could not be loaded. Please try again.'
      isLoadingSettings.value = false
    }
  )
})
</script>
