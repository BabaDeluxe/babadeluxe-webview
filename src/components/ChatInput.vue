<template>
  <div class="flex flex-col gap-2 w-full relative group/composer">
    <transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="transform scale-95 opacity-0"
      enter-to-class="transform scale-100 opacity-100"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="transform scale-100 opacity-100"
      leave-to-class="transform scale-95 opacity-0"
    >
      <AtPicker
        v-if="isPickerOpen"
        :items="pickerResults"
        :active-index="pickerActiveIndex"
      />
    </transition>

    <div
      class="flex flex-col gap-1.5 bg-panel border border-borderMuted rounded-xl p-1.5 transition-colors focus-within:border-accent"
    >
      <div
        v-if="activeSources.length > 0"
        class="flex flex-wrap gap-1.5 px-1.5 pt-1 animate-fade-in"
      >
        <AtPill
          v-for="source in activeSources"
          :key="source.id"
          :item="source"
          @remove="removeSource(source.id)"
        />
      </div>

      <div class="flex items-center gap-2">
        <slot name="prepend" />

        <BaseTextField
          ref="textFieldRef"
          v-model:value="computedInputValue"
          variant="ghost"
          :placeholder="placeholder"
          :disabled="isSubmitting"
          data-testid="chat-input"
          class="flex-1"
          @keydown="handleKeydown"
        />

        <div class="flex items-center gap-1 pr-1.5">
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
            @click="emit('abort')"
          />
        </div>

        <slot name="append" />
      </div>

      <slot name="controls" />
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { watchDebounced } from '@vueuse/core'
import AtPicker from '@/components/chat/AtPicker.vue'
import AtPill from '@/components/chat/AtPill.vue'
import { useAtPicker, type AtPickerItem } from '@/composables/use-at-picker'
import BaseButton from '@/components/BaseButton.vue'
import BaseTextField from '@/components/BaseTextField.vue'

interface ChatInputProps {
  value: string
  placeholder?: string
  isSubmitting?: boolean
  submitIcon?: string
  abortIcon?: string
  atSources?: AtPickerItem[]
}

const props = withDefaults(defineProps<ChatInputProps>(), {
  placeholder: 'Message...',
  isSubmitting: false,
  submitIcon: 'i-bi:send',
  abortIcon: 'i-bi:stop-circle',
  atSources: () => [],
})

const emit = defineEmits<{
  'update:value': [value: string]
  submit: [value: string]
  abort: []
}>()

const textFieldRef = useTemplateRef<InstanceType<typeof BaseTextField>>('textFieldRef')

const {
  isOpen: isPickerOpen,
  results: pickerResults,
  activeIndex: pickerActiveIndex,
  activeSources,
  open: openPicker,
  close: closePicker,
  moveDown: movePickerDown,
  moveUp: movePickerUp,
  accept: acceptPicker,
  removeSource,
} = useAtPicker(() => props.atSources)

const computedInputValue = computed({
  get: () => props.value,
  set: (newValue) => {
    emit('update:value', newValue)
  },
})

const isSubmitDisabled = computed(() => {
  const isInputEmpty = props.value.trim().length === 0
  return isInputEmpty || props.isSubmitting
})

const textareaElement = computed(() => {
  const componentElement = textFieldRef.value?.$el as HTMLElement | undefined
  return componentElement?.querySelector('textarea')
})

function handleSubmit() {
  const trimmedValue = props.value.trim()
  const canSubmit = trimmedValue && !props.isSubmitting
  if (canSubmit) {
    emit('submit', trimmedValue)
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (isPickerOpen.value) {
    handlePickerKeydown(event)
    return
  }

  handleDefaultKeydown(event)
}

function handlePickerKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      movePickerDown()
      break
    case 'ArrowUp':
      event.preventDefault()
      movePickerUp()
      break
    case 'Tab':
      event.preventDefault()
      handlePickerAcceptance()
      break
    case 'Enter':
      if (pickerResults.value.length > 0) {
        event.preventDefault()
        handlePickerAcceptance()
      }
      break
    case 'Escape':
      event.preventDefault()
      closePicker()
      break
  }
}

function handlePickerAcceptance() {
  acceptPicker()
  removeMentionTokenFromInput()
}

function removeMentionTokenFromInput() {
  const textarea = textareaElement.value
  if (!textarea) return

  const cursorPosition = textarea.selectionStart
  const textBeforeCursor = props.value.slice(0, cursorPosition)
  const lastAtSymbolIndex = textBeforeCursor.lastIndexOf('@')

  if (lastAtSymbolIndex !== -1) {
    const newValue = props.value.slice(0, lastAtSymbolIndex) + props.value.slice(cursorPosition)
    emit('update:value', newValue)
  }
}

function handleDefaultKeydown(event: KeyboardEvent) {
  const isEnterPressed = event.key === 'Enter'
  const isModifierPressed = event.shiftKey || event.ctrlKey

  if (isEnterPressed && !isModifierPressed) {
    event.preventDefault()
    handleSubmit()
    return
  }

  const isBackspacePressed = event.key === 'Backspace'
  const hasActiveSources = activeSources.value.length > 0
  const textarea = textareaElement.value

  if (
    isBackspacePressed &&
    hasActiveSources &&
    textarea &&
    textarea.selectionStart === 0 &&
    textarea.selectionEnd === 0
  ) {
    event.preventDefault()
    const lastSource = activeSources.value.at(-1)
    if (lastSource) removeSource(lastSource.id)
  }
}

watchDebounced(
  () => props.value,
  (newValue) => {
    const textarea = textareaElement.value
    if (!textarea) return

    const cursorPosition = textarea.selectionStart
    const textBeforeCursor = newValue.slice(0, cursorPosition)
    const lastAtSymbolIndex = textBeforeCursor.lastIndexOf('@')

    if (lastAtSymbolIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtSymbolIndex + 1)
      const isAlphanumericQuery = /^[\w-]*$/.test(textAfterAt)

      if (isAlphanumericQuery) {
        openPicker(textAfterAt)
        return
      }
    }
    closePicker()
  },
  { debounce: 50 }
)

defineExpose({
  focus: () => textFieldRef.value?.focus(),
  activeSources,
})
</script>
