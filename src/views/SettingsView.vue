<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { ResultAsync } from 'neverthrow'
import { validateSetting } from '@babadeluxe/shared'
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

type ModelTemperatures = Record<string, number>

function setModelTemperature(
  current: ModelTemperatures,
  modelValue: string,
  value: number
): ModelTemperatures {
  return { ...current, [modelValue]: value }
}

function resetModelTemperature(current: ModelTemperatures, modelValue: string): ModelTemperatures {
  const next = { ...current }
  delete next[modelValue]
  return next
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
    injectionPositionOptions.find((p) => p.value === promptInjectionPosition.value)?.description ??
    ''
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

const getSettingByKey = (key: string) => settings.value.find((s) => s.settingKey === key)

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
  const s = settings.value.find((x) => x.settingKey === 'modelTemperatures')
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
