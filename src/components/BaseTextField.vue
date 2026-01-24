<template>
  <div class="flex w-full">
    <textarea
      ref="textareaRef"
      v-model="internalValue"
      v-bind="$attrs"
      :placeholder="placeholder"
      :disabled="disabled"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
      rows="1"
      class="w-full bg-panel border border-borderMuted rounded-md px-3 py-2 text-base outline-none text-deepText placeholder-subtleText focus:border-accent transition-colors resize-none"
      :style="{ maxHeight: maxHeight, minHeight: '2.5rem' }"
    />
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useTextareaAutosize } from '@vueuse/core'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<{
    placeholder?: string
    value?: string
    disabled?: boolean
    maxHeight?: string
  }>(),
  {
    maxHeight: '12rem',
  }
)

const emit = defineEmits<{
  'update:value': [value: string]
  input: [value: string]
}>()

const { textarea: textareaRef, input: internalValue } = useTextareaAutosize({
  styleProp: 'minHeight',
})

defineExpose({
  focus: () => {
    textareaRef.value?.focus()
  },
})

watch(
  () => props.value,
  (newValue) => {
    if (newValue !== internalValue.value) {
      internalValue.value = newValue ?? ''
    }
  },
  { immediate: true }
)

watch(internalValue, (newValue) => {
  emit('update:value', newValue)
  emit('input', newValue)
})
</script>
