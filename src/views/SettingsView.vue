<template>
  <section
    id="settings"
    data-testid="settings-container"
    class="flex-1 flex flex-col gap-6 p-4"
  >
    <!-- Unified Alert Banners -->
    <BaseAlertList :banners="alertBanners" />

    <!-- Loading State -->
    <div
      v-if="isLoadingSettings"
      data-testid="loading-state"
      class="flex-1 flex items-center justify-center"
    >
      <BaseSpinner
        size="medium"
        message="Loading settings..."
      />
    </div>

    <!-- Main Content -->
    <template v-else>
      <!-- General Settings Section -->
      <section
        v-if="generalSettings.length > 0"
        data-testid="general-settings-section"
      >
        <h2 class="text-xl font-semibold mb-4 text-deepText">General Settings</h2>
        <div
          v-for="setting in generalSettings"
          :key="setting.settingKey"
          class="mb-4"
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
            class="text-error text-xs mt-1"
          >
            {{ fieldStates[setting.settingKey]?.error }}
          </div>
        </div>
      </section>

      <!-- API Providers Section -->
      <section data-testid="api-providers-section">
        <h3 class="text-lg font-semibold mb-3 text-deepText">API Keys</h3>
        <div
          v-for="provider in apiProviders"
          :key="provider.key"
          class="mb-4"
        >
          <BaseInput
            v-model="fieldStates[provider.key].value"
            type="password"
            :label="provider.name"
            :placeholder="`Enter ${provider.name} API key...`"
            :required="provider.required"
            :validation-state="fieldStates[provider.key].status"
            :error="fieldStates[provider.key].error"
            :toggleable="true"
            :data-testid="`api-${provider.key}`"
            @update:model-value="handleApiKeyInput(provider.key, $event)"
          />
        </div>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, inject, watch } from 'vue'
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
import { API_KEY_VALIDATOR_KEY, LOGGER_KEY } from '@/injection-keys'
import type { ConsoleLogger } from '@simwai/utils'
import type { ApiKeyValidator } from '@/api-key-validator'
import { InvalidApiKeyError, LlmRateLimitedError } from '@/errors'

type FieldStatus = 'idle' | 'validating' | 'valid' | 'invalid'

type FieldState = {
  value: string
  status: FieldStatus
  error?: string
}

const logger: ConsoleLogger = inject(LOGGER_KEY)!
const validator: ApiKeyValidator = inject(API_KEY_VALIDATOR_KEY)!

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

  if (result.isErr()) {
    const error = result.error
    logger.error(`Validation failed for ${provider}:`, error)

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
  upsertSetting(provider, apiKey, definition.dataType)

  const reloadModelsResult = await reloadModels()
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
