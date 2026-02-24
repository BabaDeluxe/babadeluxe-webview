<template>
  <Teleport to="body">
    <Transition mode="out-in">
      <div
        v-if="isShown"
        class="fixed inset-0 bg-slate/80 flex items-center justify-center z-50 animate-fade-in animate-duration-200 animate-ease-out"
        @click.self="handleBackdropClick"
      >
        <div
          ref="modalRef"
          :data-testid="dataTestId"
          :class="[
            sizeClasses,
            'bg-panel border border-borderMuted rounded-lg p-6 w-full',
            'animate-fade-in animate-duration-200 animate-ease-out',
          ]"
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
              <BaseButton
                variant="ghost"
                @click="handleCancel"
              >
                {{ cancelText }}
              </BaseButton>
              <BaseButton
                variant="primary"
                :is-disabled="confirmDisabled"
                @click="handleConfirm"
              >
                {{ confirmText }}
              </BaseButton>
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
import BaseButton from '@/components/BaseButton.vue'

interface BaseModalProps {
  isShown?: boolean
  title?: string
  confirmText?: string
  cancelText?: string
  confirmDisabled?: boolean
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
  size?: 'small' | 'medium' | 'large'
  dataTestId?: string
}

const props = withDefaults(defineProps<BaseModalProps>(), {
  isShown: false,
  title: undefined,
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  confirmDisabled: false,
  closeOnBackdrop: true,
  closeOnEscape: true,
  size: 'medium',
  dataTestId: undefined,
})

interface BaseModalEmits {
  (event: 'update:is-shown', value: boolean): void
  (event: 'confirm'): void
  (event: 'cancel'): void
}

const emit = defineEmits<BaseModalEmits>()

const modalRef = ref<HTMLElement>()

const isShown = computed(() => props.isShown)
const dataTestId = computed(() => props.dataTestId)

const titleId = computed(() => `modal-title-${Math.random().toString(36).slice(2, 9)}`)

const sizeClasses = computed(() => {
  return {
    small: 'max-w-sm',
    medium: 'max-w-md',
    large: 'max-w-2xl',
  }[props.size]
})

const closeModal = () => {
  emit('update:is-shown', false)
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

onKeyStroke('Escape', (event) => {
  if (isShown.value && props.closeOnEscape) {
    event.preventDefault()
    handleCancel()
  }
})

watch(
  () => isShown.value,
  async (shown) => {
    if (shown) {
      await nextTick()
      modalRef.value?.focus()
    }
  }
)
</script>
