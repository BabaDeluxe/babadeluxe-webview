<script setup lang="ts">
import { computed, type CSSProperties, type StyleValue, useAttrs, watch } from 'vue'
import { useTextareaAutosize } from '@vueuse/core'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    placeholder?: string
    value?: string
    disabled?: boolean
    maxHeight?: string
    variant?: 'input' | 'message'
  }>(),
  {
    placeholder: '',
    value: '',
    maxHeight: '12rem',
    variant: 'input',
  }
)

const emit = defineEmits<{
  'update:value': [value: string]
  input: [value: string]
}>()

const attrs = useAttrs()

const forwardedAttrs = computed(() => {
  const rest: Record<string, unknown> = { ...attrs }
  delete rest.class
  delete rest.style
  return rest
})

const textareaClass = computed(() => {
  const base =
    props.variant === 'input'
      ? 'w-full bg-panel border border-borderMuted rounded-lg px-3 py-2 text-base outline-none text-deepText placeholder-subtleText focus:border-accent transition-colors resize-none'
      : 'w-full bg-transparent border-none px-0 py-0 text-sm outline-none text-deepText placeholder-subtleText resize-none'

  return [base, attrs.class]
})

const textareaStyle = computed<StyleValue>(() => {
  const baseStyle: CSSProperties =
    props.variant === 'input'
      ? { maxHeight: props.maxHeight, minHeight: '2.5rem' }
      : { maxHeight: props.maxHeight }

  const attributeStyle = attrs.style as StyleValue | undefined
  return attributeStyle ? [attributeStyle, baseStyle] : baseStyle
})

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

<template>
  <div class="flex w-full">
    <textarea
      ref="textareaRef"
      v-model="internalValue"
      v-bind="forwardedAttrs"
      :placeholder="placeholder"
      :disabled="disabled"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
      rows="1"
      :class="textareaClass"
      :style="textareaStyle"
    />
  </div>
</template>
