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
      v-if="activeSources.length > 0"
      class="flex flex-wrap gap-1.5 px-1 animate-fade-in"
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
        ref="inputRef"
      v-model:value="computedValue"
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
  </div>
</template>

<script setup lang="ts">
import { computed, useTemplateRef, ref, watch } from 'vue'
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

const inputRef = useTemplateRef<InstanceType<typeof BaseTextField>>('inputRef')
const {
  isOpen: isPickerOpen,
  query: pickerQuery,
  results: pickerResults,
  activeIndex: pickerActiveIndex,
  activeSources,
  open: openPicker,
  close: closePicker,
  moveDown: movePickerDown,
  moveUp: movePickerUp,
  accept: acceptPicker,
  removeSource,
} = useAtPicker(props.atSources)

const computedValue = computed({
  get: () => props.value,
  set: (val) => {
    emit('update:value', val)
  },
})

const isSubmitDisabled = computed(() => {
  const isInputEmpty = props.value.trim().length === 0
  return isInputEmpty || props.isSubmitting
})

function handleSubmit() {
  const trimmed = props.value.trim()
  if (!trimmed || props.isSubmitting) return
  emit('submit', trimmed)
}

function handleKeydown(event: KeyboardEvent) {
  if (isPickerOpen.value) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      movePickerDown()
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      movePickerUp()
      return
    }
    if (event.key === 'Tab' || (event.key === 'Enter' && pickerResults.value.length > 0)) {
      event.preventDefault()
      const item = acceptPicker()
      if (item) {
        const textarea = (inputRef.value?.$el as HTMLElement).querySelector('textarea')
        if (textarea) {
          const pos = textarea.selectionStart
          const text = props.value
          const lastAt = text.lastIndexOf('@', pos - 1)
          if (lastAt !== -1) {
            const newValue = text.slice(0, lastAt) + text.slice(pos)
            emit('update:value', newValue)
          }
        }
      }
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closePicker()
      return
    }
  }

  const isEnterPressed = event.key === 'Enter'
  const isModifierPressed = event.shiftKey || event.ctrlKey

  if (isEnterPressed && !isModifierPressed) {
    event.preventDefault()
    handleSubmit()
    return
  }

  if (event.key === 'Backspace' && props.value === '' && activeSources.value.length > 0) {
    event.preventDefault()
    activeSources.value.pop()
    return
  }
}

watch(() => props.value, (newVal) => {
  const textarea = (inputRef.value?.$el as HTMLElement)?.querySelector('textarea')
  if (!textarea) return

  const pos = textarea.selectionStart
  const textBeforeCursor = newVal.slice(0, pos)
  const lastAt = textBeforeCursor.lastIndexOf('@')

  if (lastAt !== -1) {
    const textAfterAt = textBeforeCursor.slice(lastAt + 1)
    if (/^\w*$/.test(textAfterAt)) {
      openPicker(textAfterAt)
      return
    }
  }
  closePicker()
})

defineExpose({
  focus: () => inputRef.value?.focus(),
  activeSources,
})
</script>
