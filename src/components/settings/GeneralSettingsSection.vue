<template>
  <section
    v-if="settings.length > 0"
    data-testid="general-settings-section"
    class="flex flex-col gap-4"
  >
    <h2 class="text-xl font-onest font-semibold text-deepText">General Settings</h2>
    <div
      v-for="setting in settings"
      :key="setting.settingKey"
      class="flex flex-col gap-1"
    >
      <SettingsField
        :setting="setting"
        :field-name="setting.settingKey"
        :name="setting.settingKey"
        @field-changed="(name, val) => $emit('field-changed', name, val)"
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
</template>

<script setup lang="ts">
import SettingsField from '@/components/SettingsField.vue'
import type { UserSettingWithValidation } from '@babadeluxe/shared'
import type { FieldState } from '@/composables/use-api-key-management'

defineProps<{
  settings: UserSettingWithValidation[]
  fieldStates: Record<string, FieldState>
}>()

defineEmits<{
  (event: 'field-changed', fieldName: string, value: string | number | boolean): void
}>()
</script>
