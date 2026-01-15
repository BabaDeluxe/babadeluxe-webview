<template>
  <Transition
    name="fade"
    mode="out-in"
  >
    <div
      v-if="!isEditing"
      key="content"
    >
      <slot name="content">
        {{ content }}
      </slot>
    </div>

    <div
      v-else
      key="editing"
      class="min-h-5 md:max-w-60vw w-full overflow-x-hidden"
    >
      <textarea
        ref="textareaRef"
        v-model="localValue"
        :disabled="isSaving"
        :placeholder="placeholder"
        class="w-full bg-transparent resize-none outline-none border-none text-sm font-sans leading-relaxed pr-3 focus:ring-2 focus:ring-accent/20 rounded min-w-60vw w-full text-deepText overflow-hidden"
        data-testid="editable-textarea"
        @keydown="handleKeydown"
      />
    </div>
  </Transition>

  <div
    v-if="isEditing"
    class="absolute right-0 top-0 flex flex-row flex-row gap-1 flex-0 justify-end items-start"
  >
    <button
      class="flex flex-col flex-0 items-center justify-center w-7 h-7 rounded-md hover:bg-accent/20 text-accent transition-all duration-200 active:scale-95"
      :class="{ 'opacity-50 cursor-not-allowed': isSaving }"
      :disabled="isSaving"
      :title="saveHint"
      data-testid="editable-save-button"
      @click="handleSave"
    >
      <i
        v-if="!isSaving"
        class="i-weui:done-outlined text-lg"
      />
      <i
        v-else
        class="i-svg-spinners:ring-resize text-lg"
      />
    </button>
    <button
      class="flex flex-col flex-0 items-center justify-center w-7 h-7 rounded-md hover:bg-borderMuted/20 text-subtleText hover:text-deepText transition-all duration-200 active:scale-95"
      :class="{ 'opacity-50 cursor-not-allowed': isSaving }"
      :disabled="isSaving"
      :title="cancelHint"
      data-testid="editable-cancel-button"
      @click="handleCancel"
    >
      <i class="i-weui:close-outlined text-lg" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { watch, nextTick, useTemplateRef } from 'vue'
import { useTextareaAutosize } from '@vueuse/core'

interface BaseEditableTextProps {
  content: string
  isEditing: boolean
  isSaving: boolean
  placeholder?: string
  saveHint?: string
  cancelHint?: string
}

const props = withDefaults(defineProps<BaseEditableTextProps>(), {
  placeholder: 'Enter text...',
  saveHint: 'Save (Enter)',
  cancelHint: 'Cancel (Esc)',
})

const emit = defineEmits<{
  (event: 'save', value: string): void
  (event: 'cancel'): void
}>()

const textareaRef = useTemplateRef<HTMLTextAreaElement>('textareaRef')
const { input: localValue } = useTextareaAutosize({ element: textareaRef })

watch(
  () => props.isEditing,
  async (isEditing) => {
    if (isEditing) {
      localValue.value = props.content
      await nextTick()
      textareaRef.value?.focus()
      return
    }
    localValue.value = ''
  }
)

function handleSave() {
  if (props.isSaving) return

  const trimmedValue = localValue.value.trim()
  if (trimmedValue.length === 0 || trimmedValue === props.content) {
    emit('cancel')
    return
  }

  emit('save', trimmedValue)
}

function handleCancel() {
  if (props.isSaving) return
  emit('cancel')
}

function handleKeydown(event: KeyboardEvent) {
  if (props.isSaving) {
    event.preventDefault()
    return
  }

  if (event.key === 'Enter' && !event.ctrlKey && !event.shiftKey) {
    event.preventDefault()
    handleSave()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    handleCancel()
  }
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 150ms ease-in-out;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-to,
.fade-leave-from {
  opacity: 1;
}
</style>
