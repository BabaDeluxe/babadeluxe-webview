<template>
  <Transition
    enter-active-class="transition-all duration-200 ease-out"
    enter-from-class="opacity-0 translate-y-2"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition-all duration-150 ease-in"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 translate-y-2"
  >
    <button
      v-if="isVisible"
      type="button"
      aria-label="Scroll to bottom"
      data-testid="scroll-to-bottom-button"
      class="fixed z-40 flex items-center justify-center rounded-full border border-borderMuted bg-panel text-subtleText shadow-lg backdrop-blur-sm transition-colors hover:bg-borderMuted/60 hover:text-deepText active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      :style="buttonStyle"
      @click="emit('click')"
    >
      <i class="i-bi:chevron-double-down text-base" aria-hidden="true" />
    </button>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface ScrollToBottomButtonProps {
  isVisible: boolean
  bottomOffsetPx?: number
  rightOffsetPx?: number
}

const props = withDefaults(defineProps<ScrollToBottomButtonProps>(), {
  bottomOffsetPx: 16,
  rightOffsetPx: 16,
})

const emit = defineEmits<{ click: [] }>()

const buttonStyle = computed(() => ({
  bottom: `max(env(safe-area-inset-bottom, 0px), ${props.bottomOffsetPx}px)`,
  right: `${props.rightOffsetPx}px`,
  width: '2.75rem',
  height: '2.75rem',
  minWidth: '44px',
  minHeight: '44px',
}))
</script>
