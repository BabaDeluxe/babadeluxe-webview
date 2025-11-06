<template>
  <input
    v-if="setting.dataType === 'string'"
    :id="fieldName"
    :name="fieldName"
    type="text"
    :class="getInputClasses()"
    :value="String(setting.settingValue ?? '')"
    @input="$emit('field-changed', fieldName, ($event.target as HTMLInputElement).value)"
  />

  <input
    v-else-if="setting.dataType === 'number'"
    :id="fieldName"
    :name="fieldName"
    type="number"
    :class="getInputClasses()"
    :value="Number(setting.settingValue ?? 0)"
    @input="
      $emit(
        'field-changed',
        fieldName,
        Number.parseFloat(($event.target as HTMLInputElement).value) || 0
      )
    "
  />

  <label
    v-else-if="setting.dataType === 'boolean'"
    :for="fieldName"
    class="flex items-center gap-3 cursor-pointer"
  >
    <input
      :id="fieldName"
      :name="fieldName"
      type="checkbox"
      class="sr-only"
      :checked="!!setting.settingValue"
      @change="$emit('field-changed', fieldName, ($event.target as HTMLInputElement).checked)"
    />
    <div
      :class="[
        'w-10 h-6 rounded-full transition-colors relative',
        setting.settingValue ? 'bg-accent' : 'bg-borderMuted',
      ]"
    >
      <div
        :class="[
          'w-4 h-4 bg-white rounded-full shadow transform transition-transform absolute top-1',
          setting.settingValue ? 'left-5' : 'left-1',
        ]"
      />
    </div>
    <span class="text-sm text-deepText">
      {{ setting.settingValue ? 'Enabled' : 'Disabled' }}
    </span>
  </label>
</template>

<script setup lang="ts">
interface Props {
  setting: {
    dataType: string
    settingValue: unknown
    [key: string]: unknown
  }
  fieldName: string
}

defineProps<Props>()
defineEmits<{
  'field-changed': [fieldName: string, value: unknown]
}>()

const getInputClasses = () => {
  return 'w-full px-3 py-2 bg-codeBg border border-borderMuted rounded-md text-deepText outline-none focus:border-accent transition-colors'
}
</script>
