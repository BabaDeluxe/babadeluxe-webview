<template>
  <section
    id="settings"
    data-testid="settings-container"
    class="flex-1 flex flex-col gap-6 p-4 sm:p-6 max-w-4xl mx-auto w-full overflow-y-auto min-h-0"
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
        :get-top-p-for-model="getTopPForModel"
        :get-top-k-for-model="getTopKForModel"
        :get-reasoning-effort-for-model="getReasoningEffortForModel"
        @temperature-change="handleTemperatureChange"
        @temperature-reset="handleTemperatureReset"
        @top-p-change="handleTopPChange"
        @top-p-reset="handleTopPReset"
        @top-k-change="handleTopKChange"
        @top-k-reset="handleTopKReset"
        @reasoning-effort-change="handleReasoningEffortChange"
        @reasoning-effort-reset="handleReasoningEffortReset"
      />

      <ApiKeySection
        :api-providers="apiProviders"
        :field-states="fieldStates"
        @api-key-input="handleApiKeyInput"
      />

      <div class="h-px bg-border my-2" />

      <OllamaSection
        :model-value="ollamaUrlValue"
        @update:model-value="handleOllamaUrlChange"
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
import OllamaSection from '@/components/settings/OllamaSection.vue'
import { API_KEY_VALIDATOR_KEY, LOGGER_KEY, SUPABASE_CLIENT_KEY } from '@/injection-keys'
import { AuthError, InitializationError } from '@/errors'
import { safeInject } from '@/safe-inject'
import { ResultAsync } from 'neverthrow'
import { computed, onMounted, ref } from 'vue'
import { promptInjectionDefaults, validateSetting } from '@babadeluxe/shared'
import { useModelsSocket } from '@/composables/use-models-socket'
import { useSettings } from '@/composables/use-settings'
import { useApiKeyManagement } from '@/composables/use-api-key-management'
import { useSettingsModelPreferences } from '@/composables/use-settings-model-preferences'
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

const ollamaUrlValue = computed<string>(() => getSettingValue('ollamaUrl', ''))

const handleOllamaUrlChange = async (value: string) => {
  await upsertSetting('ollamaUrl', value, 'string')
}

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

const {
  getTemperatureForModel,
  handleTemperatureChange,
  handleTemperatureReset,
  getTopPForModel,
  handleTopPChange,
  handleTopPReset,
  getTopKForModel,
  handleTopKChange,
  handleTopKReset,
  getReasoningEffortForModel,
  handleReasoningEffortChange,
  handleReasoningEffortReset,
} = useSettingsModelPreferences(settings, upsertSetting, logger, toasts)

async function upsertSettingWrapper(
  key: string,
  value: unknown,
  dataType: 'string' | 'number' | 'boolean' | 'json-object' | 'json-array'
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
