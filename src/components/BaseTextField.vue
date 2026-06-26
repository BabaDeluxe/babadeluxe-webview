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
    variant?: 'input' | 'message' | 'ghost'
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
  if (props.variant === 'ghost') {
    return [
      'w-full bg-transparent border-none px-3 py-2 text-base outline-none text-deepText placeholder-subtleText resize-none',
      attrs.class,
    ]
  }

  const base =
    props.variant === 'input' || props.variant === 'message'
      ? 'w-full bg-panel border border-borderMuted rounded-lg px-3 py-2 text-base outline-none text-deepText placeholder-subtleText focus:border-accent transition-colors resize-none'
      : 'w-full bg-transparent border-none px-0 py-0 text-sm outline-none text-deepText placeholder-subtleText resize-none'

  return [base, attrs.class]
})

const textareaStyle = computed<StyleValue>(() => {
  const baseStyle: CSSProperties =
    props.variant === 'input' || props.variant === 'message' || props.variant === 'ghost'
      ? { maxHeight: props.maxHeight, minHeight: '2.5rem' }
      : { maxHeight: props.maxHeight }

  const attributeStyle = attrs.style as StyleValue | undefined
  return attributeStyle ? [attributeStyle, baseStyle] : baseStyle
})

const { textarea: textareaRef, input: internalValue } = useTextareaAutosize({
  styleProp: 'minHeight',
})

const textFieldElement = computed(() => textareaRef.value)

defineExpose({
  focus: () => {
    textFieldElement.value?.focus()
  },
})

watch(
  () => props.value,
  (incomingValue) => {
    const isValueOutOfSync = incomingValue !== internalValue.value
    if (isValueOutOfSync) {
      internalValue.value = incomingValue ?? ''
    }
  },
  { immediate: true }
)

watch(internalValue, (newInternalValue) => {
  emit('update:value', newInternalValue)
  emit('input', newInternalValue)
})
</script>
