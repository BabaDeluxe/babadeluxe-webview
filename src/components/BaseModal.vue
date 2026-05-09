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
          tabindex="-1"
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
                variant="secondary"
                text="Cancel"
                @click="emit('close')"
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
  dataTestId?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  closeOnBackdrop?: boolean
}

const props = withDefaults(defineProps<BaseModalProps>(), {
  size: 'md',
  closeOnBackdrop: true,
})

const emit = defineEmits<{ close: [] }>()

const modalRef = ref<HTMLElement | undefined>(undefined)
const titleId = useId()

const sizeClasses = computed(() => {
  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  }
  return sizes[props.size]
})

watch(
  () => props.isShown,
  async (shown) => {
    if (shown) {
      await nextTick()
      modalRef.value?.focus()
    }
  }
)

function handleBackdropClick() {
  if (props.closeOnBackdrop) emit('close')
}
</script>
