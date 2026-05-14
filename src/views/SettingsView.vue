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
      <BaseButton variant="secondary" @click="handleReload">Reload Page</BaseButton>
    </div>

    <div
      v-else-if="loadError"
      data-testid="load-error-state"
      class="flex-1 flex flex-col items-center justify-center gap-4 text-center"
    >
      <p class="text-error text-lg">{{ loadError }}</p>
      <BaseButton variant="secondary" @click="handleRetryLoad">Retry</BaseButton>
    </div>

    <div
      v-else-if="!apiKeyValidator.isReady.value || isLoadingSettings"
      data-testid="loading-state"
      class="flex-1 flex items-center justify-center"
    >
      <BaseSpinner size="medium" message="Loading settings..." />
    </div>

    <template v-else-if="isReady">
      <!-- Appearance -->
      <section data-testid="appearance-section" class="flex flex-col gap-4">
        <h2 class="text-xl font-onest font-semibold text-deepText">Appearance</h2>
        <div class="flex items-center justify-between p-3 border border-borderMuted rounded-lg bg-panel">
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

      <!-- General Settings -->
      <section
        v-if="generalSettings.length > 0"
        data-testid="general-settings-section"
        class="flex flex-col gap-4"
      >
        <h2 class="text-xl font-onest font-semibold text-deepText">General Settings</h2>
        <div v-for="setting in generalSettings" :key="setting.settingKey" class="flex flex-col gap-1">
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

      <!-- Model Preferences -->
      <section data-testid="model-preferences-section" class="flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-onest font-semibold text-deepText">Model Preferences</h2>
          <span class="text-xs text-subtleText">Temperature controls generation randomness (0 = precise, 2 = wild)</span>
        </div>

        <div v-if="availableModels.length === 0" class="text-sm text-subtleText">
          No models available. Make sure an API key is configured.
        </div>

        <div v-else class="flex flex-col gap-2">
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

      <!-- API Keys -->
      <section data-testid="api-providers-section" class="flex flex-col gap-4">
        <h3 class="text-lg font-onest font-semibold text-deepText">API Keys</h3>
        <div v-for="provider in apiProviders" :key="provider.key" class="flex flex-col gap-1">
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
import { validateSetting, DEFAULT_TEMPERATURE, setModelTemperature, resetModelTemperature } from '@babadeluxe/shared'
import type { ModelTemperatures } from '@babadeluxe/shared'
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
  useApiKeyManagement(resolvedValidator, logger, upsertSettingWrapper, reloadModels, () => currentUserId.value, settings)

const updateFieldStatus = (key: string, status: 'valid' | 'invalid' | 'validating' | 'idle', error?: string) => {
  if (fieldStates.value[key]) {
    fieldStates.value[key].status = status
    fieldStates.value[key].error = error
  }
}

const isLoadingSettings = ref(true)
const loadError = ref<string | undefined>()

// ---------------------------------------------------------------------------
// Model temperature state
// ---------------------------------------------------------------------------

const availableModels = computed(() => models.value ?? [])

const modelTemperatures = computed<ModelTemperatures>(() => {
  const s = settings.value.find((x) => x.settingKey === 'modelTemperatures')
  return (s?.settingValue as ModelTemperatures) ?? {}
})

function getTemperatureForModel(modelValue: string): number {
  return modelTemperatures.value[modelValue] ?? DEFAULT_TEMPERATURE
}

async function persistTemperatures(next: ModelTemperatures): Promise<void> {
  const result = await upsertSetting('modelTemperatures', next, 'string')
  if (result.isErr()) {
    logger.error('Failed to save model temperatures', { error: result.error })
    toasts.error(toUserMessage(result.error))
  }
}

async function handleTemperatureChange(modelValue: string, value: number): Promise<void> {
  const validation = validateSetting('modelTemperatures', { ...modelTemperatures.value, [modelValue]: value })
  if (!validation.success) return
  await persistTemperatures(setModelTemperature(modelTemperatures.value, modelValue, value))
}

async function handleTemperatureReset(modelValue: string): Promise<void> {
  await persistTemperatures(resetModelTemperature(modelTemperatures.value, modelValue))
}

// ---------------------------------------------------------------------------
// Existing handlers (unchanged)
// ---------------------------------------------------------------------------

const handleReload = () => { window.location.reload() }

const handleRetryLoad = async () => {
  loadError.value = undefined
  isLoadingSettings.value = true
  const result = await ResultAsync.fromPromise(loadSettings(), (e) =>
    e instanceof Error ? new InitializationError(e.message, e) : new InitializationError('Failed to load settings', e)
  )
  result.match(
    () => { hydrateFieldStates(); isLoadingSettings.value = false },
    (err) => { logger.error('Failed to reload settings', { userId: currentUserId.value, error: err }); loadError.value = 'Settings could not be loaded. Please try again.'; isLoadingSettings.value = false }
  )
}

const generalSettings = computed(() =>
  settings.value.filter((s) => !s.settingKey.startsWith('apiKey') && !s.settingKey.startsWith('model'))
)

watch(modelsReloadWarning, (val) => { if (val) toasts.warning(toUserMessage(val)) }, { immediate: true })
watch(settings, () => { if (isLoadingSettings.value) return; hydrateFieldStates() }, { deep: true })

const getSettingByKey = (key: string) => settings.value.find((s) => s.settingKey === key)

const handleFieldChange = async (fieldName: string, value: unknown) => {
  if (isLoadingSettings.value) return
  const setting = getSettingByKey(fieldName)
  if (!setting) return
  const validationResult = validateSetting(fieldName, value)
  if (!validationResult.success) { updateFieldStatus(fieldName, 'invalid', validationResult.error); return }
  updateFieldStatus(fieldName, 'validating')
  const saveResult = await upsertSetting(fieldName, value, setting.dataType)
  if (saveResult.isErr()) { updateFieldStatus(fieldName, 'invalid', toUserMessage(saveResult.error)); logger.error('Failed to save setting', { fieldName, error: saveResult.error }); return }
  updateFieldStatus(fieldName, 'valid')
  toasts.success('Setting saved')
}

async function upsertSettingWrapper(key: string, value: unknown, dataType: 'string' | 'number' | 'boolean'): Promise<void> {
  const result = await upsertSetting(key, value, dataType)
  if (result.isErr()) { logger.error('Failed to save setting via API key management', { key, error: result.error }); toasts.error(toUserMessage(result.error)) }
}

const handleThemeToggle = async () => {
  toggleDark()
  await upsertSetting('theme', isDark.value ? 'dark' : 'light', 'string')
}

const fetchUserId = async (): Promise<void> => {
  if (isOfflineMode()) { currentUserId.value = 'offline-user'; return }
  const r = await ResultAsync.fromPromise(supabase.auth.getUser(), (e) =>
    e instanceof Error ? new AuthError(e.message, e) : new AuthError('Failed to fetch user', e)
  )
  r.match(
    (res) => { if (res.data.user?.id) currentUserId.value = res.data.user.id },
    (err) => { logger.error('Failed to fetch user details for settings view', { error: err }) }
  )
}

onMounted(async () => {
  await fetchUserId()
  const result = await ResultAsync.fromPromise(loadSettings(), (e) =>
    e instanceof Error ? new InitializationError(e.message, e) : new InitializationError('Failed to load settings', e)
  )
  result.match(
    () => { hydrateFieldStates(); isLoadingSettings.value = false },
    (err) => { logger.error('Failed to load settings', { userId: currentUserId.value, error: err }); loadError.value = 'Settings could not be loaded. Please try again.'; isLoadingSettings.value = false }
  )
})
</script>
