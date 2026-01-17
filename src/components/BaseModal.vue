<template>
  <Teleport to="body">
    <Transition
      name="modal-fade"
      @after-leave="handleAfterLeave"
    >
      <div
        v-if="show"
        class="fixed inset-0 bg-slate/80 flex items-center justify-center z-50"
        @click.self="handleBackdropClick"
      >
        <div
          ref="modalRef"
          :class="[sizeClasses, 'bg-panel border border-borderMuted rounded-lg p-6 w-full mx-4']"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
        >
          <h3
            v-if="title"
            :id="titleId"
            class="text-lg font-medium mb-4 text-deepText"
          >
            {{ title }}
          </h3>

          <slot name="title" />

          <div class="mb-4">
            <slot />
          </div>

          <div class="flex justify-end gap-2">
            <slot name="actions">
              <button
                class="px-4 py-2 text-subtleText hover:text-deepText transition-colors"
                @click="handleCancel"
              >
                {{ cancelText }}
              </button>
              <button
                class="px-4 py-2 bg-accent text-slate rounded-md hover:bg-accentHover transition-colors"
                :disabled="confirmDisabled"
                @click="handleConfirm"
              >
                {{ confirmText }}
              </button>
            </slot>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, watch, nextTick, ref } from 'vue'
import { onKeyStroke } from '@vueuse/core'

interface BaseModalProps {
  show: boolean
  title?: string
  confirmText?: string
  cancelText?: string
  confirmDisabled?: boolean
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
  size?: 'small' | 'medium' | 'large'
}

const props = withDefaults(defineProps<BaseModalProps>(), {
  title: undefined,
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  confirmDisabled: false,
  closeOnBackdrop: true,
  closeOnEscape: true,
  size: 'medium',
})

interface BaseModalEmits {
  (event: 'update:show', value: boolean): void
  (event: 'confirm'): void
  (event: 'cancel'): void
}

const emit = defineEmits<BaseModalEmits>()

const modalRef = ref<HTMLElement>()
const titleId = computed(() => `modal-title-${Math.random().toString(36).slice(2, 9)}`)

const sizeClasses = computed(() => {
  return {
    small: 'max-w-sm',
    medium: 'max-w-md',
    large: 'max-w-2xl',
  }[props.size]
})

const closeModal = () => {
  emit('update:show', false)
}

const handleConfirm = () => {
  emit('confirm')
}

const handleCancel = () => {
  emit('cancel')
  closeModal()
}

const handleBackdropClick = () => {
  if (props.closeOnBackdrop) {
    handleCancel()
  }
}

const handleAfterLeave = () => {
  // Clean up focus when modal is fully closed
}

onKeyStroke('Escape', (event) => {
  if (props.show && props.closeOnEscape) {
    event.preventDefault()
    handleCancel()
  }
})

watch(
  () => props.show,
  async (isShown) => {
    if (isShown) {
      await nextTick()
      modalRef.value?.focus()
    }
  }
)
</script>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
