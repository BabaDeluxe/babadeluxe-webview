<template>
  <div
    class="flex flex-col w-full border border-borderMuted rounded-lg bg-panel overflow-hidden max-h-24"
  >
    <BaseTextField
      ref="baseTextFieldRef"
      class="bg-transparent border-0 rounded-none"
      :value="modelValue"
      :placeholder="placeholder"
      :data-testid="testId"
      :is-disabled="isDisabled"
      @update:value="emit('update:modelValue', $event)"
      @keydown.enter.exact.prevent="emit('submit')"
    />

    <div class="flex justify-end items-end items-center gap-0">
      <slot name="controls" />

      <BaseButton
        v-if="!isSubmitting"
        variant="ghost"
        class="bg-transparent"
        :icon="submitIcon"
        :data-testid="submitButtonTestId"
        :is-disabled="!canSubmit"
        :is-loading="isLoading"
        @click="onSubmit"
      >
        <template #loading>
          <BaseSpinner size="small" />
        </template>
      </BaseButton>

      <BaseButton
        v-else
        variant="ghost"
        class="bg-transparent"
        :icon="abortIcon"
        :data-testid="abortButtonTestId"
        @click="emit('abort')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import type { AbstractLogger } from '@/logger'
import BaseTextField from '@/components/BaseTextField.vue'
import BaseButton from '@/components/BaseButton.vue'
import BaseSpinner from '@/components/BaseSpinner.vue'
import { LOGGER_KEY } from '@/injection-keys'
import { safeInject } from '@/safe-inject'

interface ChatInputProps {
  modelValue: string
  isDisabled?: boolean
  isLoading?: boolean
  isSubmitting?: boolean
  placeholder?: string
  testId?: string
  submitButtonTestId?: string
  abortButtonTestId?: string
  submitIcon?: string
  abortIcon?: string
}

const props = withDefaults(defineProps<ChatInputProps>(), {
  isDisabled: false,
  isLoading: false,
  isSubmitting: false,
  placeholder: 'Type a message...',
  testId: 'message-input',
  submitButtonTestId: 'submit-button',
  abortButtonTestId: 'abort-button',
  submitIcon: 'i-bi:play-circle',
  abortIcon: 'i-bi:stop-circle',
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'submit'): void
  (event: 'abort'): void
}>()

const logger: AbstractLogger = safeInject(LOGGER_KEY)

const canSubmit = computed(() => props.modelValue.trim().length > 0 && !props.isDisabled)

const baseTextFieldRef = useTemplateRef('baseTextFieldRef')

function focus(): void {
  const instance = baseTextFieldRef.value

  if (instance?.focus) {
    instance.focus()
    return
  }

  const rootElement = instance?.$el
  if (rootElement instanceof HTMLElement) {
    const inputElement = rootElement.querySelector('input,textarea')
    if (inputElement instanceof HTMLElement) {
      inputElement.focus()
      return
    }
  }

  logger.warn('ChatInput.focus(): BaseTextField does not expose a focusable element')
}

function onSubmit() {
  if (!canSubmit.value || props.isDisabled || props.isLoading) return
  emit('submit')
}

defineExpose({ focus })
</script>
