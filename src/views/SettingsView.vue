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
import { type Result, ResultAsync } from 'neverthrow'
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
import SettingField from '@/components/SettingField.vue'
import { API_KEY_VALIDATOR_KEY, LOGGER_KEY, SOCKET_MANAGER_KEY } from '@/injection-keys'
import type { ConsoleLogger } from '@simwai/utils'
import {
  ApiKeyValidationError,
  type ApiKeyValidator,
  type ValidationResult,
} from '@/api-key-validator'
import type { SocketManager } from '@/socket-manager'

type FieldStatus = 'idle' | 'validating' | 'valid' | 'invalid'

type FieldState = {
  value: string
  status: FieldStatus
  error?: string
  showSecret: boolean
}

type UiValidationResult = {
  success: boolean
  error?: string
}

const logger: ConsoleLogger = inject(LOGGER_KEY)!
const validator: ApiKeyValidator = inject(API_KEY_VALIDATOR_KEY)!
const socketManager: SocketManager = inject(SOCKET_MANAGER_KEY)!
const { settings, upsertSetting, loadSettings } = useSettingsSocket()
const apiProviders = getApiProviders()

// Initialize field states for API keys
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

const validateApiKey = async (
  provider: string,
  apiKey: string
): Promise<Result<UiValidationResult, ApiKeyValidationError>> => {
  // Parse schema first
  const schema = settingSchemas[provider as SettingKey]
  if (!schema) {
    return ResultAsync.fromSafePromise(
      Promise.reject(new ApiKeyValidationError('Unknown provider'))
    )
  }

  const parseResult = schema.safeParse(apiKey)
  if (!parseResult.success) {
    const errorMsg = parseResult.error.issues[0]?.message ?? 'Invalid format'
    return ResultAsync.fromSafePromise(Promise.reject(new ApiKeyValidationError(errorMsg)))
  }

  // Validate against backend
  const providerName = provider.replace('apiKey', '').toLowerCase()
  const backendResult = await validator.validate(
    socketManager.validationSocket,
    providerName,
    apiKey
  )

  // Synchronous transformation - use map
  return backendResult.map((backendResponse) => mapValidationResponse(backendResponse))
}

const mapValidationResponse = (response: ValidationResult): UiValidationResult => {
  if (response.type === 'valid') {
    return { success: true }
  }

  if (response.type === 'recognized') {
    return {
      success: false,
      error:
        response.reason === 'rate_limited'
          ? 'Rate limited - try again later'
          : 'Key recognized but request invalid',
    }
  }

  if (response.type === 'invalid_key') {
    return { success: false, error: 'Invalid API key' }
  }

  if (response.type === 'network_error') {
    return { success: false, error: 'Network error - check connection' }
  }

  if (response.type === 'server_error') {
    return { success: false, error: 'Provider server error - try again' }
  }

  if (response.type === 'unsupported_provider') {
    return { success: false, error: 'Unsupported provider' }
  }

  const _exhaustive: never = response
  return _exhaustive
}

const validateSetting = (
  _key: string,
  value: unknown,
  schema: z.ZodTypeAny
): UiValidationResult => {
  const result = schema.safeParse(value)

  if (!result.success) {
    return {
      success: false,
      error: result.error.issues[0]?.message ?? 'Invalid value',
    }
  }

  return { success: true }
}

const validateAndSaveApiKey = async (provider: string, apiKey: string) => {
  if (isLoadingSettings.value) return

  const meta = settingMetadata[provider as SettingKey]
  if (!meta) return

  if (meta.minLength !== undefined && apiKey.length < meta.minLength) {
    updateFieldStatus(provider, 'invalid', `Min ${meta.minLength} chars`)
    return
  }

  updateFieldStatus(provider, 'validating')
  const result = await validateApiKey(provider, apiKey)

  result.match(
    (uiResult) => {
      if (uiResult.success) {
        updateFieldStatus(provider, 'valid')
        upsertSetting(provider, apiKey, meta.dataType)
      } else {
        updateFieldStatus(provider, 'invalid', uiResult.error)
      }
    },
    (error) => {
      updateFieldStatus(provider, 'invalid', error.message)
      logger.error('[validateAndSaveApiKey]', error)
    }
  )
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

  const validationResult = validateSetting(fieldName, value, schema)

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
  try {
    await loadSettings()
    hydrateFieldStates()
    isLoadingSettings.value = false
  } catch (error) {
    logger.error('[SettingsView] Failed to load settings:', error as Error)
    loadError.value = error instanceof Error ? error.message : 'Failed to load settings'
    isLoadingSettings.value = false
  }
})

onBeforeUnmount(() => {
  isDebounceStopped.value = true
})
</script>
