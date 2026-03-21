<template>
  <div
    class="flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border animate-fade-in-up min-w-[300px] max-w-[400px]"
    :class="classes"
    role="status"
    aria-live="polite"
  >
    <i
      :class="iconClass"
      class="text-lg shrink-0"
      aria-hidden="true"
    />
    <span class="text-sm font-medium flex-1 break-words">{{ message }}</span>
    <button
      class="ml-auto opacity-70 hover:opacity-100 p-1"
      aria-label="Close"
      @click="$emit('close')"
    >
      <i
        class="i-weui:close-outlined"
        aria-hidden="true"
      />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ToastType } from '@/stores/use-toast-store'

const props = defineProps<{
  message: string
  type: ToastType
}>()

defineEmits<{
  close: []
}>()

const classes = computed(() => {
  switch (props.type) {
    case 'success':
      return 'bg-panel border-accent text-deepText'
    case 'error':
      return 'bg-error/10 border-error text-error'
    case 'warning':
      return 'bg-warning/10 border-warning text-warning'
    default:
      return 'bg-panel border-borderMuted text-deepText'
  }
})

const iconClass = computed(() => {
  switch (props.type) {
    case 'success':
      return 'i-bi:check-circle-fill text-accent'
    case 'error':
      return 'i-bi:exclamation-circle-fill'
    case 'warning':
      return 'i-bi:exclamation-triangle-fill'
    default:
      return 'i-bi:info-circle-fill text-accent'
  }
})
</script>

<style scoped>
.animate-fade-in-up {
  animation: fadeInUp 0.3s ease-out forwards;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
