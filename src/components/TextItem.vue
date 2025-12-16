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
      class="w-full bg-panel border border-borderMuted rounded-md px-3 py-2 text-base outline-none text-deepText placeholder-subtleText focus:border-accent transition-colors resize-none overflow-y-auto"
      :style="{ maxHeight: maxHeight }"
    />
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useTextareaAutosize } from '@vueuse/core'

defineOptions({
  inheritAttrs: false,
})

const props = defineProps<{
  placeholder?: string
  value?: string
  disabled?: boolean
  maxHeight?: string
}>()

const emit = defineEmits<{
  'update:value': [value: string]
  input: [value: string]
}>()

const { textarea: textareaRef, input: internalValue } = useTextareaAutosize({
  styleProp: 'minHeight',
})

// Expose focus method
defineExpose({
  focus: () => {
    textareaRef.value?.focus()
  },
})

// Watch props.value changes
watch(
  () => props.value,
  (newValue) => {
    if (newValue !== internalValue.value) {
      internalValue.value = newValue ?? ''
    }
  },
  { immediate: true }
)

// Emit changes
watch(internalValue, (newValue) => {
  emit('update:value', newValue)
  emit('input', newValue)
})
</script>

<style scoped>
textarea {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

textarea::-webkit-scrollbar {
  display: none;
}
</style>
