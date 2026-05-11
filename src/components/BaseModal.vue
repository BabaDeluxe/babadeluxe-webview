<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-150"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isShown"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        @click.self="handleBackdropClick"
      >
        <div
          ref="modalRef"
          :class="['bg-panel border border-borderMuted rounded-xl shadow-xl w-full flex flex-col gap-4 p-6 focus:outline-none', sizeClasses]"
          role="dialog"
          aria-modal="true"
          tabindex="-1"
          :aria-labelledby="titleId"
        >
          <h3
            v-if="title"
            :id="titleId"
            class="text-base font-semibold text-deepText"
          >
            {{ title }}
          </h3>

          <div class="text-sm text-subtleText">
            <slot />
          </div>

          <div class="flex justify-end gap-2">
            <slot name="actions">
              <BaseButton
                variant="secondary"
                :text="cancelText"
                @click="handleCancel"
              />
              <BaseButton
                v-if="confirmText"
                variant="primary"
                :text="confirmText"
                :is-disabled="confirmDisabled"
                @click="handleConfirm"
              />
            </slot>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, useId } from 'vue'
import BaseButton from '@/components/BaseButton.vue'

interface BaseModalProps {
  isShown: boolean
  title?: string
  confirmText?: string
  cancelText?: string
  confirmDisabled?: boolean
  closeOnBackdrop?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
  dataTestId?: string
}

const props = withDefaults(defineProps<BaseModalProps>(), {
  size: 'md',
  cancelText: 'Cancel',
  confirmDisabled: false,
  closeOnBackdrop: true,
})

const emit = defineEmits<{
  close: []
  confirm: []
  cancel: []
}>()

const modalRef = ref<HTMLElement | undefined>(undefined)
const titleId = useId()

const sizeClasses = computed(() => {
  const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl' }
  return sizes[props.size]
})

function handleConfirm() {
  emit('confirm')
}

function handleCancel() {
  emit('cancel')
  emit('close')
}

function handleBackdropClick() {
  if (props.closeOnBackdrop) handleCancel()
}

watch(
  () => props.isShown,
  async (shown) => {
    if (shown) {
      await nextTick()
      modalRef.value?.focus()
    }
  }
)
</script>
