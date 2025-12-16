<template>
  <section
    id="settings"
    data-testid="settings-container"
    class="flex-1 flex flex-col gap-6 p-4"
  >
    <div
      v-if="isLoadingSettings"
      data-testid="loading-state"
      class="flex items-center justify-center p-8"
    >
      <span class="text-subtleText">Loading settings...</span>
    </div>

    <div
      v-else-if="loadError"
      data-testid="error-state"
      class="flex items-center justify-center p-8"
    >
      <span class="text-error">{{ loadError }}</span>
    </div>

    <!-- Warning -->
    <div
      v-if="modelsReloadWarning"
      data-testid="models-reload-warning"
      class="bg-warning/10 border border-warning text-warning px-4 py-3 rounded-md mb-4 flex items-center justify-between"
    >
      <span>
        {{ modelsReloadWarning }}
      </span>
      <button
        data-testid="dismiss-warning-button"
        class="ml-4 underline hover:no-underline"
        @click="modelsReloadWarning = undefined"
      >
        Dismiss
      </button>
    </div>

    <template v-else>
      <section
        v-if="generalSettings.length > 0"
        data-testid="general-settings-section"
      >
        <h2 class="text-xl font-semibold mb-4">General Settings</h2>
        <div
          v-for="setting in generalSettings"
          :key="setting.settingKey"
          class="mb-4"
        >
          <label
            :for="setting.settingKey"
            class="block font-medium mb-1"
          >
            {{ formatSettingLabel(setting.settingKey) }}
            <span
              v-if="setting.required"
              class="text-error"
              >*</span
            >
          </label>
          <p
            v-if="setting.description"
            class="text-sm text-subtleText mb-2"
          >
            {{ setting.description }}
          </p>
          <SettingField
            :setting="setting"
            :field-name="setting.settingKey"
            :name="setting.settingKey"
            @field-changed="handleFieldChange"
          />
          <div
            v-if="fieldStates[setting.settingKey]?.error"
            role="alert"
            :aria-label="`Error for ${setting.settingKey}`"
            class="text-error text-xs mt-1"
          >
            {{ fieldStates[setting.settingKey]?.error }}
          </div>
        </div>
      </section>

      <section data-testid="api-providers-section">
        <h3 class="text-lg font-semibold mb-3">API Keys</h3>
        <div
          v-for="provider in apiProviders"
          :key="provider.key"
          class="mb-4"
        >
          <label
            :for="`api-${provider.key}`"
            class="block font-medium mb-1"
          >
            {{ provider.name }}
            <span
              v-if="provider.required"
              class="text-error"
              >*</span
            >
          </label>
          <div class="flex gap-2 items-center">
            <input
              :id="`api-${provider.key}`"
              :name="provider.key"
              :aria-label="`${provider.name} API key`"
              :aria-invalid="fieldStates[provider.key]?.status === 'invalid'"
              :type="fieldStates[provider.key]?.showSecret ? 'text' : 'password'"
              :value="fieldStates[provider.key]?.value ?? ''"
              :placeholder="`Enter ${provider.name} API key...`"
              :class="getFieldInputClasses(provider.key)"
              @input="handleApiKeyInput(provider.key, $event)"
            />
            <button
              type="button"
              :name="`toggle-secret-${provider.key}`"
              :aria-label="`Toggle ${provider.name} visibility`"
              class="px-3 py-2 bg-panel hover:bg-slate border border-borderMuted rounded-md transition-colors text-deepText"
              @click="toggleSecretVisibility(provider.key)"
            >
              {{ fieldStates[provider.key]?.showSecret ? '🙈' : '👁️' }}
            </button>
            <span
              v-if="fieldStates[provider.key]?.status === 'validating'"
              :aria-label="`Validation status for ${provider.name}`"
              class="text-sm text-subtleText whitespace-nowrap"
            >
              Validating...
            </span>
            <span
              v-else-if="fieldStates[provider.key]?.status === 'valid'"
              :aria-label="`Validation success for ${provider.name}`"
              class="text-accent text-lg"
            >
              ✓
            </span>
          </div>
          <div
            v-if="fieldStates[provider.key]?.error"
            role="alert"
            :aria-label="`Error for ${provider.name}`"
            class="text-error text-xs pt-1"
          >
            {{ fieldStates[provider.key]?.error }}
          </div>
        </div>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, inject, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { ResultAsync } from 'neverthrow'
import {
  getApiProviders,
  settingMetadata,
  validateSetting,
  type SettingKey,
} from '@babadeluxe/shared'
import { useSettingsSocket } from '@/composables/use-settings-socket'
import { reloadModels } from '@/composables/use-models-socket'
import SettingField from '@/components/SettingField.vue'
import { API_KEY_VALIDATOR_KEY, LOGGER_KEY, SOCKET_MANAGER_KEY } from '@/injection-keys'
import type { ConsoleLogger } from '@simwai/utils'
import type { ApiKeyValidator } from '@/api-key-validator'
import type { SocketManager } from '@/socket-manager'
import { InvalidApiKeyError, LlmRateLimitedError } from '@/errors'

type FieldStatus = 'idle' | 'validating' | 'valid' | 'invalid'

type FieldState = {
  value: string
  status: FieldStatus
  error?: string
  showSecret: boolean
}

const logger: ConsoleLogger = inject(LOGGER_KEY)!
const validator: ApiKeyValidator = inject(API_KEY_VALIDATOR_KEY)!
const socketManager: SocketManager = inject(SOCKET_MANAGER_KEY)!

const { settings, upsertSetting, loadSettings } = useSettingsSocket()
const apiProviders = getApiProviders()

const fieldStates = ref<Record<string, FieldState>>(
  Object.fromEntries(
    apiProviders.map((provider) => [
      provider.key,
      {
        value: '',
        status: 'idle' as FieldStatus,
        showSecret: false,
      },
    ])
  )
)

const isLoadingSettings = ref(true)
const loadError = ref<string>()
const isDebounceStopped = ref(false)
const modelsReloadWarning = ref<string>()

const generalSettings = computed(() =>
  settings.value.filter((s) => !s.settingKey.startsWith('apiKey'))
)

const getSettingByKey = (key: string) => settings.value.find((s) => s.settingKey === key)

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

const updateFieldValue = (key: string, value: string) => {
  if (!fieldStates.value[key]) return

  fieldStates.value[key] = {
    ...fieldStates.value[key],
    value,
  }
}

const toggleSecretVisibility = (key: string) => {
  if (!fieldStates.value[key]) return

  fieldStates.value[key].showSecret = !fieldStates.value[key].showSecret
}

const getFieldInputClasses = (key: string) => {
  const baseClasses =
    'w-full px-3 py-2 bg-codeBg border rounded-lg text-deepText focus:outline-none transition-colors'
  const status = fieldStates.value[key]?.status ?? 'idle'

  const errorClasses =
    status === 'invalid'
      ? 'border-error focus:border-error'
      : status === 'valid'
        ? 'border-accent focus:border-accent'
        : 'border-borderMuted focus:border-accent'

  return `${baseClasses} ${errorClasses}`
}

const validateAndSaveApiKey = async (provider: string, apiKey: string) => {
  if (isLoadingSettings.value) return

  const meta = settingMetadata[provider as SettingKey]
  if (!meta) return

  const validationResult = validateSetting(provider, apiKey)
  if (!validationResult.success) {
    updateFieldStatus(provider, 'invalid', validationResult.error)
    return
  }

  updateFieldStatus(provider, 'validating')

  const providerName = provider.replace('apiKey', '').toLowerCase()
  const result = await validator.validate(providerName, apiKey)

  if (result.isErr()) {
    const error = result.error
    logger.error(`Validation failed for ${provider} after user entered API key:`, error)

    if (error instanceof InvalidApiKeyError) {
      updateFieldStatus(provider, 'invalid', 'The provided API key is not valid.')
    } else if (error instanceof LlmRateLimitedError) {
      updateFieldStatus(provider, 'invalid', 'Rate limited. Please wait a moment.')
    } else {
      updateFieldStatus(provider, 'invalid', error.message)
    }
    return
  }

  updateFieldStatus(provider, 'valid')
  upsertSetting(provider, apiKey, meta.dataType)

  const reloadModelsResult = await reloadModels(socketManager, logger)

  if (reloadModelsResult.isErr()) {
    logger.error('Failed to reload models after API key validation:', reloadModelsResult.error)
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

const handleApiKeyInput = (provider: string, event: Event) => {
  const input = event.target as HTMLInputElement
  const apiKey = input.value.trim()

  updateFieldValue(provider, apiKey)
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

const formatSettingLabel = (settingKey: string) => {
  return settingKey
    .replace(/^apiKey/, '')
    .split(/(?=[A-Z])/)
    .join(' ')
}

onMounted(async () => {
  const result = await ResultAsync.fromPromise(
    loadSettings(),
    (unknownError) =>
      new Error(unknownError instanceof Error ? unknownError.message : 'Failed to load settings')
  )

  result.match(
    () => {
      hydrateFieldStates()
      isLoadingSettings.value = false
    },
    (loadErr) => {
      logger.error('Failed to load settings on initial page load:', loadErr)
      loadError.value = loadErr.message
      isLoadingSettings.value = false
    }
  )
})

onBeforeUnmount(() => {
  isDebounceStopped.value = true
})
</script>
