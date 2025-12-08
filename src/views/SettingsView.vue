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
      class="bg-warning/10 border border-warning text-warning px-4 py-3 rounded-md mb-4 flex items-center justify-between"
    >
      <span>
        {{ modelsReloadWarning }}
      </span>
      <button
        class="ml-4 underline hover:no-underline"
        @click="modelsReloadWarning = undefined"
      >
        Dismiss
      </button>
    </div>

    <template v-else>
      <section v-if="generalSettings.length > 0">
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
            :data-testid="`field-${setting.settingKey}`"
            @field-changed="handleFieldChange"
          />
          <div
            v-if="fieldStates[setting.settingKey]?.error"
            :data-testid="`error-${setting.settingKey}`"
            class="text-error text-xs mt-1"
          >
            {{ fieldStates[setting.settingKey]?.error }}
          </div>
        </div>
      </section>

      <section>
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
              :data-testid="`input-${provider.key}`"
              :aria-label="provider.name"
              :aria-invalid="fieldStates[provider.key]?.status === 'invalid'"
              :type="fieldStates[provider.key]?.showSecret ? 'text' : 'password'"
              :value="fieldStates[provider.key]?.value ?? ''"
              :placeholder="`Enter ${provider.name} API key...`"
              :class="getFieldInputClasses(provider.key)"
              @input="handleApiKeyInput(provider.key, $event)"
            />
            <button
              type="button"
              :data-testid="`toggle-secret-${provider.key}`"
              :aria-label="`Toggle ${provider.name} visibility`"
              class="px-3 py-2 bg-panel hover:bg-slate border border-borderMuted rounded-md transition-colors text-deepText"
              @click="toggleSecretVisibility(provider.key)"
            >
              {{ fieldStates[provider.key]?.showSecret ? '🙈' : '👁️' }}
            </button>
            <span
              v-if="fieldStates[provider.key]?.status === 'validating'"
              :data-testid="`validation-status-${provider.key}`"
              class="text-sm text-subtleText whitespace-nowrap"
            >
              Validating...
            </span>
            <span
              v-else-if="fieldStates[provider.key]?.status === 'valid'"
              :data-testid="`validation-success-${provider.key}`"
              class="text-accent text-lg"
            >
              ✓
            </span>
          </div>
          <div
            v-if="fieldStates[provider.key]?.error"
            :data-testid="`error-${provider.key}`"
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
import { z } from 'zod/v4'
import {
  getApiProviders,
  settingMetadata,
  settingSchemas,
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

    if (!setting?.settingValue) continue
    if (!fieldStates.value[provider.key]) continue

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

  const schema = settingSchemas[provider as SettingKey]
  if (schema) {
    const parseResult = schema.safeParse(apiKey)
    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues[0]?.message ?? 'Invalid format'
      updateFieldStatus(provider, 'invalid', errorMsg)
      return
    }
  }

  updateFieldStatus(provider, 'validating')

  const providerName = provider.replace('apiKey', '').toLowerCase()
  const result = await validator.validate(providerName, apiKey)

  if (result.isErr()) {
    const error = result.error
    logger.error(`Validation failed for ${provider}`, error)

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
    logger.error('Failed to reload models after key validation:', reloadModelsResult.error)
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

const buildValidationSchema = (key: string): z.ZodTypeAny | undefined => {
  const setting = getSettingByKey(key)

  if (!setting) return undefined

  let schema: z.ZodTypeAny

  switch (setting.dataType) {
    case 'string': {
      schema = z.string()
      if (setting.minLength !== undefined) {
        schema = (schema as z.ZodString).min(
          setting.minLength,
          `Must be at least ${setting.minLength} characters`
        )
      }
      if (setting.maxLength !== undefined) {
        schema = (schema as z.ZodString).max(
          setting.maxLength,
          `Must be at most ${setting.maxLength} characters`
        )
      }
      break
    }
    case 'number': {
      schema = z.number()
      if (setting.minValue !== undefined) {
        schema = (schema as z.ZodNumber).min(setting.minValue)
      }
      if (setting.maxValue !== undefined) {
        schema = (schema as z.ZodNumber).max(setting.maxValue)
      }
      break
    }
    case 'boolean': {
      schema = z.boolean()
      break
    }
    default: {
      schema = z.unknown()
    }
  }

  if (!setting.required) {
    schema = schema.optional()
  }

  return schema
}

const handleFieldChange = async (fieldName: string, value: unknown) => {
  if (isLoadingSettings.value) return

  const setting = getSettingByKey(fieldName)
  if (!setting) return

  const schema = buildValidationSchema(fieldName)
  if (!schema) return

  const result = schema.safeParse(value)

  if (!result.success) {
    updateFieldStatus(fieldName, 'invalid', result.error.issues[0]?.message ?? 'Invalid value')
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
  try {
    await loadSettings()
    hydrateFieldStates()
    isLoadingSettings.value = false
  } catch (error) {
    logger.error('Failed to load settings:', error as Error)
    loadError.value = error instanceof Error ? error.message : 'Failed to load settings'
    isLoadingSettings.value = false
  }
})

onBeforeUnmount(() => {
  isDebounceStopped.value = true
})
</script>
