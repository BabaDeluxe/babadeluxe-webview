<template>
<section id="settings">
  <div class="flex flex-col">
    <div class="flex">
      <div v-if="filteredSettings.length === 0">No settings found.</div>
      <Form v-else :validation-schema="validationSchema">
        <div v-for="setting in filteredSettings" :key="setting.settingKey">
          <div>
            <label :for="setting.settingKey">
              {{ _formatSettingLabel(setting.settingKey) }}
              <span v-if="setting.required">*</span>
            </label>
            <p v-if="setting.description">
              {{ setting.description }}
            </p>
          </div>
          <SettingField :setting="setting" :field-name="setting.settingKey" @field-changed="_handleFieldChange" />
        </div>
      </Form>
    </div>
    <div>
      <h3>API Keys</h3>
      <div v-for="provider in apiProviders" :key="provider.key">
        <label :for="`api-${provider.key}`">{{ provider.name }} *</label>
        <div class="flex">
          <Field :name="`apiKey_${provider.key}`" :id="`api-${provider.key}`"
            :type="showApiKeys[provider.key] ? 'text' : 'password'" :placeholder="`Enter ${provider.name} API key...`"
            @input="_handleApiKeyChange(provider.key, $event.target.value)" />
          <span v-if="validationStatus[provider.key] === 'validating'">Validating...</span>
          <span v-else-if="validationStatus[provider.key] === 'valid'">✓</span>
        </div>
        <div v-if="validationErrors[provider.key]" class="text-error text-sm">
          {{ validationErrors[provider.key] }}
        </div>
      </div>
    </div>
  </div>
</section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Form, Field, useForm } from 'vee-validate'
import { useDebounceFn } from '@vueuse/core'
import * as yup from 'yup'
import type { AnySchema } from 'yup'
import { toTypedSchema } from '@vee-validate/yup'
import { ApiKeyValidator } from '../api-key-validator'
import { useSettingsSocket } from '@/composables/use-settings-socket'

interface Setting {
  settingKey: string
  settingValue: unknown
  dataType: 'string' | 'number' | 'boolean' | 'json'
  settingCategory: string
  required?: boolean
  minLength?: number
  maxLength?: number
  minValue?: number
  maxValue?: number
  description?: string
}

const _validator = new ApiKeyValidator()
const { settings, updateSetting, setApiKey, loadSettings } = useSettingsSocket()

const showApiKeys = ref<Record<string, boolean>>({})
const validationStatus = ref<Record<string, 'idle' | 'validating' | 'valid' | 'invalid'>>({})
const validationErrors = ref<Record<string, string>>({})

const apiProviders = [
  { key: 'openai', name: 'OpenAI', minLength: 23 },
  { key: 'anthropic', name: 'Anthropic', minLength: 100 },
  { key: 'google', name: 'Google', minLength: 35 },
] as const

const filteredSettings = computed<Setting[]>(() => settings.value as unknown as Setting[])

const initialValues = computed<Record<string, unknown>>(() => {
  const values: Record<string, unknown> = {}
  for (const setting of filteredSettings.value) {
    values[setting.settingKey] =
      setting.dataType === 'json'
        ? JSON.stringify(setting.settingValue, null, 2)
        : setting.settingValue
  }
  return values
})

const validationSchema = computed(() => {
  const schemaObject: Record<string, AnySchema> = {}
  for (const setting of filteredSettings.value) {
    let validator: AnySchema
    switch (setting.dataType) {
      case 'string': {
        let v = yup.string()
        if (typeof setting.minLength === 'number') v = v.min(setting.minLength)
        if (typeof setting.maxLength === 'number') v = v.max(setting.maxLength)
        validator = v
        break
      }
      case 'number': {
        let v = yup.number()
        if (typeof setting.minValue === 'number') v = v.min(setting.minValue)
        if (typeof setting.maxValue === 'number') v = v.max(setting.maxValue)
        validator = v
        break
      }
      case 'boolean': {
        validator = yup.boolean()
        break
      }
      default: {
        validator = yup.string()
      }
    }
    if (setting.required) {
      validator = validator.required()
    }
    schemaObject[setting.settingKey] = validator
  }
  return toTypedSchema(yup.object(schemaObject))
})

const { setFieldValue, resetForm } = useForm<Record<string, unknown>>({
  initialValues: initialValues.value,
})

watch(initialValues, (vals) => {
  resetForm({ values: vals }, { force: true })
})

const _validateAndSaveApiKey = async (provider: string, apiKey: string) => {
  const providerConfig = apiProviders.find((p) => p.key === provider)
  if (!providerConfig || apiKey.length < providerConfig.minLength) return
  validationStatus.value[provider] = 'validating'
  validationErrors.value[provider] = ''
  try {
    const isValid = await _validator.validate(provider, apiKey)
    if (isValid) {
      validationStatus.value[provider] = 'valid'
      await setApiKey(provider, apiKey)
    } else {
      validationStatus.value[provider] = 'invalid'
      validationErrors.value[provider] = `Invalid ${providerConfig.name} API key`
    }
  } catch {
    validationStatus.value[provider] = 'invalid'
    validationErrors.value[provider] = `Failed to validate ${providerConfig.name} API key`
  }
}

const _debouncedValidate = useDebounceFn(_validateAndSaveApiKey, 500)

const _handleApiKeyChange = (provider: string, apiKey: string) => {
  validationStatus.value[provider] = 'idle'
  validationErrors.value[provider] = ''
  const trimmed = apiKey.trim()
  if (trimmed) {
    _debouncedValidate(provider, trimmed)
  }
}

const _handleFieldChange = async (fieldName: string, value: string) => {
  setFieldValue(fieldName, value)
  const setting = filteredSettings.value.find((s: Setting) => s.settingKey === fieldName)
  if (setting) {
    await updateSetting(fieldName, value, setting.dataType, setting.settingCategory)
  }
}

const _formatSettingLabel = (settingKey: string) => {
  return settingKey
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

onMounted(async () => {
  await loadSettings()
  for (const provider of apiProviders) {
    showApiKeys.value[provider.key] = false
    validationStatus.value[provider.key] = 'idle'
    validationErrors.value[provider.key] = ''
  }
})
</script>
