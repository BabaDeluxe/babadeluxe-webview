<template>
  <div class="flex flex-col gap-0">
    <BaseTextField
      ref="baseTextFieldRef"
      :value="modelValue"
      :placeholder="placeholder"
      :data-testid="testId"
      :disabled="disabled"
      @update:value="emit('update:modelValue', $event)"
      @keydown.enter.exact.prevent="emit('submit')"
    />
    <div
      class="flex justify-end items-center border border-borderMuted rounded bg-panel overflow-hidden sm:w-full"
    >
      <slot name="controls" />
      <BaseButton
        v-if="!isSubmitting"
        :icon="submitIcon"
        :data-testid="submitButtonTestId"
        :class="submitButtonClass"
        :disabled="!canSubmit"
        :loading="isLoading"
        @click="emit('submit')"
      >
        <template #loading>
          <BaseSpinner size="small" />
        </template>
      </BaseButton>
      <BaseButton
        v-else
        :icon="abortIcon"
        :data-testid="abortButtonTestId"
        :class="abortButtonClass"
        @click="emit('abort')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, useTemplateRef } from 'vue'
import type { ConsoleLogger } from '@simwai/utils'
import BaseTextField from '@/components/BaseTextField.vue'
import BaseButton from '@/components/BaseButton.vue'
import BaseSpinner from '@/components/BaseSpinner.vue'
import { LOGGER_KEY } from '@/injection-keys.js'

interface ChatInputProps {
  modelValue: string
  disabled?: boolean
  isLoading?: boolean
  isSubmitting?: boolean
  placeholder?: string
  testId?: string
  submitButtonTestId?: string
  abortButtonTestId?: string
  submitIcon?: string
  abortIcon?: string
  submitButtonClass?: string
  abortButtonClass?: string
}

const props = withDefaults(defineProps<ChatInputProps>(), {
  disabled: false,
  isLoading: false,
  isSubmitting: false,
  placeholder: 'Type a message...',
  testId: 'message-input',
  submitButtonTestId: 'submit-button',
  abortButtonTestId: 'abort-button',
  submitIcon: 'i-bi:play-circle',
  abortIcon: 'i-bi:stop-circle',
  submitButtonClass:
    'bg-transparent text-accent hover:bg-transparent hover:text-accent/80 rounded-none border-0 shrink-0',
  abortButtonClass:
    'bg-transparent text-error hover:bg-transparent hover:text-error/80 rounded-none border-0 shrink-0',
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'submit'): void
  (event: 'abort'): void
}>()

const logger: ConsoleLogger = inject(LOGGER_KEY)!

const canSubmit = computed(() => props.modelValue.trim().length > 0 && !props.disabled)

const baseTextFieldRef = useTemplateRef<unknown>('baseTextFieldRef')

function focus(): void {
  const instance = baseTextFieldRef.value as { focus?: () => void; $el?: unknown } | undefined

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

defineExpose({ focus })
</script>
