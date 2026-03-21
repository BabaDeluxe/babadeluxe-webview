<template>
  <section
    id="settings"
    data-testid="settings-container"
    class="flex-1 flex flex-col gap-6 p-4 sm:p-6 max-w-4xl mx-auto w-full"
  >
    <div
      v-if="hasComponentError"
      data-testid="component-error"
      class="flex-1 flex flex-col items-center justify-center gap-4 text-center"
    >
      <p class="text-error text-lg">Something went wrong with the settings view.</p>
      <BaseButton
        variant="secondary"
        @click="handleReload"
      >
        Reload Page
      </BaseButton>
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
import { validateSetting } from '@babadeluxe/shared'
import { useSettingsSocket } from '@/composables/use-settings-socket'
import { useModelsSocket } from '@/composables/use-models-socket'
import { useApiKeyManagement } from '@/composables/use-api-key-management'
import { useToastStore } from '@/stores/use-toast-store'
import { useTheme } from '@/composables/use-theme'
import { toUserMessage } from '@/error-mapper'
import SettingsField from '@/components/SettingsField.vue'
import BaseSpinner from '@/components/BaseSpinner.vue'
import BaseInput from '@/components/BaseInput.vue'
import BaseButton from '@/components/BaseButton.vue'
import { API_KEY_VALIDATOR_KEY, LOGGER_KEY, SUPABASE_CLIENT_KEY } from '@/injection-keys'
import { AuthError, InitializationError } from '@/errors'
import { safeInject } from '@/safe-inject'

const logger = safeInject(LOGGER_KEY)
const validator = safeInject(API_KEY_VALIDATOR_KEY)
const supabase = safeInject(SUPABASE_CLIENT_KEY)
const toasts = useToastStore()

const { settings, upsertSetting, loadSettings } = useSettingsSocket()
const { reloadModels } = useModelsSocket()
const { isDark, toggleDark } = useTheme()

const currentUserId = ref<string>()

const upsertSettingWrapper = async (
  key: string,
  value: unknown,
  dataType: 'string' | 'number' | 'boolean'
): Promise<void> => {
  await upsertSetting(key, value, dataType)
}

const { apiProviders, fieldStates, modelsReloadWarning, hydrateFieldStates, handleApiKeyInput } =
  useApiKeyManagement(
    validator,
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

const hasComponentError = ref(false)
const handleReload = () => {
  window.location.reload()
}

const generalSettings = computed(() =>
  settings.value.filter((setting) => !setting.settingKey.startsWith('apiKey'))
)

watch(
  loadError,
  (val) => {
    if (val) {
      toasts.error(toUserMessage(val))
    }
  },
  { immediate: true }
)

watch(
  modelsReloadWarning,
  (val) => {
    if (val) {
      toasts.warning(toUserMessage(val))
    }
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

  updateFieldStatus(fieldName, 'valid')
  await upsertSetting(fieldName, value, setting.dataType)
  toasts.success('Setting saved')
}

const handleThemeToggle = async () => {
  toggleDark()
  const newValue = isDark.value ? 'dark' : 'light'
  // We optimistically toggle, then save to DB
  await upsertSetting('theme', newValue, 'string')
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
</script>
