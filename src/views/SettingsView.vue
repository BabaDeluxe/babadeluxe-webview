<template>
  <section
    id="settings"
    data-testid="settings-container"
    class="flex-1 flex flex-col gap-6 p-4 sm:p-6 max-w-4xl mx-auto w-full"
  >
    <div
      v-if="apiKeyValidator.hasError.value"
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
        >Retry</BaseButton
      >
    </div>

    <div
      v-else-if="!apiKeyValidator.isReady.value || isLoadingSettings"
      data-testid="loading-state"
      class="flex-1 flex items-center justify-center"
    >
      <BaseSpinner
        size="medium"
        message="Loading settings..."
      />
    </div>

    <template v-else-if="isReady">
      <section
        data-testid="appearance-section"
        class="flex flex-col gap-4"
      >
        <h2 class="text-xl font-onest font-semibold text-deepText">Appearance</h2>
        <div
          class="flex items-center justify-between p-3 border border-borderMuted rounded-lg bg-panel"
        >
          <div class="flex flex-col">
            <span class="text-deepText font-medium">Dark Mode</span>
            <span class="text-xs text-subtleText">Toggle application theme</span>
          </div>
          <BaseButton
            variant="ghost"
            :icon="isDark ? 'i-bi:moon-stars-fill' : 'i-bi:sun-fill'"
            :text="isDark ? 'Dark' : 'Light'"
            @click="handleThemeToggle"
          />
        </div>
      </section>
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
        data-testid="prompt-injection-section"
        class="flex flex-col gap-4"
      >
        <h2 class="text-xl font-onest font-semibold text-deepText">Prompt Behaviour</h2>
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2 mb-1">
            <span class="i-bi:chat-square-text text-accent text-sm" />
            <span class="text-sm font-medium text-deepText">Injection Mode</span>
          </div>
          <p class="text-xs text-subtleText mb-2">
            When should the system prompt be appended during a conversation?
          </p>

          <div class="flex flex-col border border-borderMuted rounded-lg bg-panel overflow-hidden">
            <div
              v-for="option in injectionModeOptions"
              :key="option.value"
            >
              <button
                type="button"
                class="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-panelHover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                :class="{
                  'bg-accentDim border-l-2 border-accent': promptInjectionMode === option.value,
                  'border-l-2 border-transparent': promptInjectionMode !== option.value,
                }"
                :data-testid="`injection-mode-${option.value}`"
                @click="handleInjectionModeChange(option.value)"
              >
                <span
                  v-if="promptInjectionMode === option.value"
                  class="mt-0.5 w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center transition-colors"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-white" />
                </span>

                <span class="flex flex-col gap-0.5 flex-1 min-w-0">
                  <span
                    class="text-sm font-medium transition-colors"
                    :class="promptInjectionMode === option.value ? 'text-accent' : 'text-deepText'"
                  >
                    {{ option.label }}
                  </span>
                  <span class="text-xs text-subtleText leading-snug">
                    {{ option.description }}
                  </span>
                </span>
              </button>
              <div
                v-if="
                  option.value === 'every-x-messages' && promptInjectionMode === 'every-x-messages'
                "
                class="flex items-center gap-3 px-4 pb-3 pt-1 bg-panelDark"
                data-testid="injection-interval-row"
              >
                <span class="text-xs text-subtleText flex-shrink-0">Interval</span>
                <input
                  type="range"
                  min="1"
                  max="20"
                  :value="promptInjectionInterval"
                  class="flex-1 accent-accent h-1 cursor-pointer"
                  data-testid="injection-interval-slider"
                  @input="handleIntervalChange"
                />
                <span
                  class="text-xs font-semibold text-accent bg-accentDim border border-accentBorder rounded px-2 py-0.5 min-w-[76px] text-center"
                >
                  {{ promptInjectionInterval }} messages
                </span>
              </div>
            </div>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2 mb-1">
            <span class="i-bi:layout-text-window text-accent text-sm" />
            <span class="text-sm font-medium text-deepText">Injection Position</span>
          </div>
          <p class="text-xs text-subtleText mb-2">
            Where should the prompt be placed relative to the message array?
          </p>
          <div class="flex gap-2">
            <button
              v-for="pos in injectionPositionOptions"
              :key="pos.value"
              type="button"
              class="flex-1 py-2 px-3 text-xs font-medium rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              :class="
                promptInjectionPosition === pos.value
                  ? 'bg-accentDim border-accent text-accent'
                  : 'bg-panel border-borderMuted text-subtleText hover:bg-panelHover'
              "
              :data-testid="`injection-position-${pos.value}`"
              @click="handlePositionChange(pos.value)"
            >
              {{ pos.label }}
            </button>
          </div>
          <p class="text-xs text-subtleText">
            {{ activePositionDescription }}
          </p>
        </div>
        <div class="flex flex-col gap-2">
          <div
            class="flex items-center justify-between p-3 border border-borderMuted rounded-lg bg-panel"
          >
            <div class="flex flex-col">
              <span class="text-deepText font-medium text-sm">Include history on re-inject</span>
              <span class="text-xs text-subtleText"
                >Re-include prior messages when the prompt is re-injected mid-conversation.</span
              >
            </div>
            <BaseButton
              variant="ghost"
              :icon="promptIncludeHistory ? 'i-bi:toggle-on' : 'i-bi:toggle-off'"
              :text="promptIncludeHistory ? 'On' : 'Off'"
              data-testid="include-history-toggle"
              @click="handleIncludeHistoryToggle"
            />
          </div>
        </div>
      </section>
      <section
        data-testid="model-preferences-section"
        class="flex flex-col gap-4"
      >
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-onest font-semibold text-deepText">Model Preferences</h2>
          <span class="text-xs text-subtleText"
            >Temperature controls generation randomness (0 = precise, 2 = wild)</span
          >
        </div>

        <div
          v-if="availableModels.length === 0"
          class="text-sm text-subtleText"
        >
          No models available. Make sure an API key is configured.
        </div>

        <div
          v-else
          class="flex flex-col gap-2"
        >
          <ModelTemperatureRow
            v-for="model in availableModels"
            :key="model.value"
            :model="model"
            :temperature="getTemperatureForModel(model.value)"
            @change="handleTemperatureChange"
            @reset="handleTemperatureReset"
          />
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
            :model-value="fieldStates[provider.key].value"
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
import { ref, computed, onMounted, watch } from 'vue'
import { ResultAsync } from 'neverthrow'
import {
  validateSetting,
  type ModelTemperatures,
  setModelTemperature,
  resetModelTemperature,
  defaultTemperature,
} from '@babadeluxe/shared'
import { useSettings } from '@/composables/use-settings'
import { useModelsSocket } from '@/composables/use-models-socket'
import { useApiKeyManagement } from '@/composables/use-api-key-management'
import { useToastStore } from '@/stores/use-toast-store'
import { useTheme } from '@/composables/use-theme'
import { toUserMessage } from '@/error-mapper'
import SettingsField from '@/components/SettingsField.vue'
import BaseSpinner from '@/components/BaseSpinner.vue'
import BaseInput from '@/components/BaseInput.vue'
import BaseButton from '@/components/BaseButton.vue'
import ModelTemperatureRow from '@/components/ModelTemperatureRow.vue'
import { API_KEY_VALIDATOR_KEY, LOGGER_KEY, SUPABASE_CLIENT_KEY } from '@/injection-keys'
import { AuthError, InitializationError } from '@/errors'
import { safeInject } from '@/safe-inject'
import { isOfflineMode } from '@/env-validator'
import type { IApiKeyValidator } from '@/api-key-validator'
import type {
  PromptInjectionMode,
  PromptInjectionPosition,
} from '@/services/prompt-injection-service'
import { promptInjectionDefaults } from '@/services/prompt-injection-service'

type Model = {
  label: string
  value: string
}

const logger = safeInject(LOGGER_KEY)
const apiKeyValidator = safeInject(API_KEY_VALIDATOR_KEY)
const supabase = safeInject(SUPABASE_CLIENT_KEY)
const toasts = useToastStore()

const { settings, upsertSetting, loadSettings } = useSettings()
const { models, reloadModels } = useModelsSocket()
const { isDark, toggleDark } = useTheme()

const currentUserId = ref<string>()

const isReady = computed(
  () => apiKeyValidator.isReady.value && apiKeyValidator.value.value !== undefined
)
const resolvedValidator = computed(() => apiKeyValidator.value.value as IApiKeyValidator)

const { apiProviders, fieldStates, modelsReloadWarning, hydrateFieldStates, handleApiKeyInput } =
  useApiKeyManagement(
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

const promptInjectionMode = computed<NonNullable<PromptInjectionMode>>(() =>
  getSettingValue('promptInjectionMode', promptInjectionDefaults.mode)
)
const promptInjectionInterval = computed<number>(() =>
  getSettingValue('promptInjectionInterval', promptInjectionDefaults.interval)
)
const promptInjectionPosition = computed<NonNullable<PromptInjectionPosition>>(() =>
  getSettingValue('promptInjectionPosition', promptInjectionDefaults.position)
)
const promptIncludeHistory = computed<boolean>(() =>
  getSettingValue('promptIncludeHistory', promptInjectionDefaults.includeHistory)
)

const injectionModeOptions: Array<{
  value: NonNullable<PromptInjectionMode>
  label: string
  description: string
}> = [
  { value: 'always', label: 'Always', description: 'Prepend the prompt to every message sent.' },
  {
    value: 'first-message',
    label: 'First message only',
    description: 'Inject once at the start of each new conversation.',
  },
  {
    value: 'every-x-messages',
    label: 'Every X messages',
    description: 'Re-inject after a set number of messages to keep context fresh.',
  },
  {
    value: 'on-prompt-change',
    label: 'On prompt change',
    description: 'Re-inject automatically when you switch to a different prompt.',
  },
  {
    value: 'manual',
    label: 'Manual',
    description: 'Never auto-inject — trigger it yourself with the inject button in chat.',
  },
]

const injectionPositionOptions: Array<{
  value: NonNullable<PromptInjectionPosition>
  label: string
  description: string
}> = [
  {
    value: 'system',
    label: 'System',
    description: 'Sent as a dedicated role: "system" message at the top of the thread.',
  },
  {
    value: 'user-prefix',
    label: 'User prefix',
    description: 'Prepended inline to the content of the first user message.',
  },
  {
    value: 'user-suffix',
    label: 'User suffix',
    description: 'Appended inline to the content of the last user message before send.',
  },
]

const activePositionDescription = computed(
  () =>
    injectionPositionOptions.find((position) => position.value === promptInjectionPosition.value)
      ?.description ?? ''
)

const handleInjectionModeChange = async (mode: NonNullable<PromptInjectionMode>) => {
  await upsertSetting('promptInjectionMode', mode, 'string')
}

const handleIntervalChange = async (event: Event) => {
  const value = Number((event.target as HTMLInputElement).value)
  const validation = validateSetting('promptInjectionInterval', value)
  if (!validation.success) return
  await upsertSetting('promptInjectionInterval', value, 'number')
}

const handlePositionChange = async (pos: NonNullable<PromptInjectionPosition>) => {
  await upsertSetting('promptInjectionPosition', pos, 'string')
}

const handleIncludeHistoryToggle = async () => {
  await upsertSetting('promptIncludeHistory', !promptIncludeHistory.value, 'boolean')
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
    (setting) =>
      !setting.settingKey.startsWith('apiKey') && !setting.settingKey.startsWith('prompt')
  )
)

watch(
  modelsReloadWarning,
  (val) => {
    if (val) toasts.warning(toUserMessage(val))
  },
  { immediate: true }
)

watch(
  settings,
  () => {
    if (isLoadingSettings.value) return
    hydrateFieldStates()
  },
  { deep: true }
)

const getSettingByKey = (key: string) =>
  settings.value.find((setting) => setting.settingKey === key)

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

const availableModels = computed<Model[]>(() => {
  const providerGroups = models.value
  if (!providerGroups) return []

  return Object.values(providerGroups)
    .flat()
    .map((model) => ({
      label: model.modelId,
      value: model.modelId,
    }))
})

const modelTemperatures = computed<ModelTemperatures>(() => {
  const s = settings.value.find((setting) => setting.settingKey === 'modelTemperatures')
  return (s?.settingValue as ModelTemperatures) ?? {}
})

function getTemperatureForModel(modelValue: string): number {
  return modelTemperatures.value[modelValue] ?? defaultTemperature
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
  await upsertSetting('theme', newValue, 'string')
}

const fetchUserId = async (): Promise<void> => {
  if (isOfflineMode()) {
    currentUserId.value = 'offline-user'
    return
  }

  const getUserResult = await ResultAsync.fromPromise(supabase.auth.getUser(), (unknownError) => {
    if (unknownError instanceof Error) return new AuthError(unknownError.message, unknownError)
    return new AuthError('Failed to fetch user', unknownError)
  })

  getUserResult.match(
    (response) => {
      if (response.data.user?.id) currentUserId.value = response.data.user.id
    },
    (fetchError) => {
      logger.error('Failed to fetch user details for settings view', { error: fetchError })
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
      logger.error('Failed to load settings', { userId: currentUserId.value, error: loadErr })
      loadError.value = 'Settings could not be loaded. Please try again.'
      isLoadingSettings.value = false
    }
  )
})
</script>
