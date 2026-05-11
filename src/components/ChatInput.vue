<template>
  <div class="flex items-center gap-2">
    <slot name="prepend" />

    <BaseTextField
      ref="inputRef"
      v-model:value="_value"
      variant="message"
      :placeholder="placeholder"
      :disabled="isSubmitting"
      data-testid="chat-input"
      class="flex-1"
      @keydown="handleKeydown"
    />

    <BaseButton
      v-if="!isSubmitting"
      variant="ghost"
      :icon="submitIcon"
      :is-disabled="isSubmitDisabled"
      aria-label="Send message"
      data-testid="chat-submit-button"
      @click="handleSubmit"
    />

    <BaseButton
      v-else
      variant="ghost"
      :icon="abortIcon"
      aria-label="Stop generating"
      data-testid="chat-abort-button"
      @click="$emit('abort')"
    />

    <slot name="append" />
  </div>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import BaseButton from '@/components/BaseButton.vue'
import BaseTextField from '@/components/BaseTextField.vue'

interface ChatInputProps {
  value: string
  placeholder?: string
  isSubmitting?: boolean
  submitIcon?: string
  abortIcon?: string
}

const props = withDefaults(defineProps<ChatInputProps>(), {
  placeholder: 'Message...',
  isSubmitting: false,
  submitIcon: 'i-bi:send',
  abortIcon: 'i-bi:stop-circle',
})

const emit = defineEmits<{
  'update:value': [value: string]
  submit: [value: string]
  abort: []
}>()

const inputRef = useTemplateRef<InstanceType<typeof BaseTextField>>('inputRef')

const _value = computed({
  get: () => props.value,
  set: (val) => { emit('update:value', val); },
})

const isSubmitDisabled = computed(() => props.value.trim().length === 0 || props.isSubmitting)

function handleSubmit() {
  const trimmed = props.value.trim()
  if (!trimmed || props.isSubmitting) return
  emit('submit', trimmed)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey) {
    event.preventDefault()
    handleSubmit()
  }
}

defineExpose({
  focus: () => inputRef.value?.focus(),
})
</script>
