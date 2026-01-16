<template>
  <div class="flex flex-col gap-0">
    <BaseTextField
      ref="textInputRef"
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
import { computed, useTemplateRef } from 'vue'
import BaseTextField from '@/components/BaseTextField.vue'
import BaseButton from '@/components/BaseButton.vue'
import BaseSpinner from '@/components/BaseSpinner.vue'

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

const canSubmit = computed(() => props.modelValue.trim().length > 0 && !props.disabled)

const textInputRef = useTemplateRef<HTMLElement>('textInputRef')

defineExpose({
  textInputRef,
})
</script>
