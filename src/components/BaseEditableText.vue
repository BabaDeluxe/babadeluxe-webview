<template>
  <Transition mode="out-in">
    <div
      v-if="!isEditing"
      key="content"
      class="animate-fade-in animate-duration-150 animate-ease-out"
    >
      <slot name="content">
        {{ content }}
      </slot>
    </div>

    <div
      v-else
      key="editing"
      class="min-h-5 w-full min-w-0 animate-fade-in animate-duration-150 animate-ease-out"
    >
      <BaseTextArea
        ref="textareaRef"
        v-model:value="localValue"
        variant="message"
        :placeholder="placeholder"
        :disabled="isSaving"
        class="leading-relaxed"
        data-testid="editable-textarea"
        @keydown="handleKeydown"
      />
    </div>
  </Transition>

  <div
    v-if="isEditing"
    class="absolute right-0 top-0 flex flex-row gap-1 justify-end items-start animate-fade-in animate-duration-150 animate-ease-out"
  >
    <BaseButton
      variant="icon"
      class="bg-panel border border-borderMuted hover:bg-borderMuted"
      :class="savingClass"
      :is-disabled="isSaving"
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
    </BaseButton>

    <BaseButton
      variant="icon"
      class="bg-panel border border-borderMuted hover:bg-borderMuted/80"
      :class="savingClass"
      :is-disabled="isSaving"
      :title="cancelHint"
      data-testid="editable-cancel-button"
      @click="handleCancel"
    />
  </div>
</template>

<script setup lang="ts">
import { watch, nextTick, useTemplateRef, computed, ref } from 'vue'
import BaseButton from '@/components/BaseButton.vue'
import BaseTextArea from '@/components/BaseTextField.vue'

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

const textareaRef = useTemplateRef<InstanceType<typeof BaseTextArea>>('textareaRef')
const localValue = ref('')

const savingClass = computed(() => (props.isSaving ? 'opacity-50 cursor-not-allowed' : ''))

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
  },
  { immediate: true }
)

function handleSave() {
  if (props.isSaving) return

  const trimmedValue = localValue.value.trim()
  if (trimmedValue.length === 0) {
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
