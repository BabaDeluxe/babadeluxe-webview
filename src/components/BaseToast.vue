<template>
  <div
    :role="type === 'error' ? 'alert' : 'status'"
    :aria-live="type === 'error' ? 'assertive' : 'polite'"
    class="flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg min-w-64 max-w-sm animate-fade-in animate-duration-200 animate-ease-out"
    :class="toastClass"
  >
    <i
      :class="iconClass"
      class="text-lg shrink-0 mt-0.5"
      aria-hidden="true"
    />
    <div class="flex flex-col gap-0.5 min-w-0">
      <span
        v-if="title"
        class="text-sm font-medium leading-snug"
      >
        {{ title }}
      </span>
      <span class="text-xs text-subtleText leading-snug">
        {{ message }}
      </span>
    </div>
    <button
      v-if="isDismissable"
      type="button"
      aria-label="Dismiss notification"
      class="ml-auto shrink-0 text-subtleText hover:text-deepText transition-colors"
      @click="$emit('dismiss')"
    >
      <i
        class="i-bi:x-lg text-xs"
        aria-hidden="true"
      />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type ToastType = 'info' | 'success' | 'warning' | 'error'

interface BaseToastProps {
  type?: ToastType
  title?: string
  message: string
  isDismissable?: boolean
}

const props = withDefaults(defineProps<BaseToastProps>(), {
  title: '',
  type: 'info',
  isDismissable: true,
})

defineEmits<{
  dismiss: []
}>()

const toastClass = computed(() => {
  const classes: Record<ToastType, string> = {
    info: 'bg-panel border-borderMuted text-deepText',
    success: 'bg-panel border-borderMuted text-deepText',
    warning: 'bg-panel border-borderMuted text-deepText',
    error: 'bg-panel border-error/40 text-deepText',
  }
  return classes[props.type]
})

const iconClass = computed(() => {
  const icons: Record<ToastType, string> = {
    info: 'i-bi:info-circle text-accent',
    success: 'i-bi:check-circle text-success',
    warning: 'i-bi:exclamation-triangle text-warning',
    error: 'i-bi:x-circle text-error',
  }
  return icons[props.type]
})
</script>
