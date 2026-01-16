<template>
  <div class="flex flex-col gap-2">
    <!-- String Field -->
    <input
      v-if="setting.dataType === 'string'"
      :id="fieldName"
      :name="fieldName"
      :value="stringValue"
      type="text"
      :class="inputClasses"
      @input="handleInput"
    />

    <!-- Number Field -->
    <input
      v-else-if="setting.dataType === 'number'"
      :id="fieldName"
      :name="fieldName"
      :value="numberValue"
      type="number"
      :class="inputClasses"
      @input="handleInput"
    />

    <!-- Boolean Field -->
    <label
      v-else-if="setting.dataType === 'boolean'"
      class="flex items-center gap-2 cursor-pointer"
    >
      <input
        :id="fieldName"
        :name="fieldName"
        :checked="booleanValue"
        type="checkbox"
        class="w-4 h-4"
        @change="handleCheckbox"
      />
      <span class="text-sm text-deepText">Enable</span>
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Setting {
  dataType: 'string' | 'number' | 'boolean'
  settingValue: unknown
}

const props = defineProps<{
  setting: Setting
  fieldName: string
}>()

const emit = defineEmits<{
  'field-changed': [fieldName: string, value: string | number | boolean]
}>()

const inputClasses =
  'w-full px-3 py-2 border border-borderMuted rounded-md bg-panel text-deepText focus:border-accent outline-none'

const stringValue = computed(() => {
  if (props.setting.dataType !== 'string') return ''
  return String(props.setting.settingValue ?? '')
})

const numberValue = computed(() => {
  if (props.setting.dataType !== 'number') return 0
  return Number(props.setting.settingValue ?? 0)
})

const booleanValue = computed(() => {
  if (props.setting.dataType !== 'boolean') return false
  return Boolean(props.setting.settingValue)
})

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement
  const value = props.setting.dataType === 'number' ? Number(target.value) : target.value
  emit('field-changed', props.fieldName, value)
}

function handleCheckbox(event: Event) {
  const target = event.target as HTMLInputElement
  emit('field-changed', props.fieldName, target.checked)
}
</script>
