<template>
  <Transition
    enter-active-class="transition-all duration-200 ease-out"
    leave-active-class="transition-all duration-150 ease-in"
    enter-from-class="opacity-0 translate-y-2 scale-90"
    enter-to-class="opacity-100 translate-y-0 scale-100"
    leave-from-class="opacity-100 translate-y-0 scale-100"
    leave-to-class="opacity-0 translate-y-2 scale-90"
  >
    <button
      v-if="isVisible"
      type="button"
      aria-label="Scroll to bottom"
      data-testid="scroll-to-bottom-button"
      class="
        absolute bottom-4 right-4 z-10
        inline-flex items-center justify-center
        w-8 h-8 min-w-[44px] min-h-[44px]
        rounded-full
        bg-panel border border-borderMuted
        text-subtleText
        shadow-md
        cursor-pointer
        transition-colors transition-transform duration-150
        hover:text-deepText hover:bg-borderMuted/20 hover:brightness-105
        active:brightness-95 active:scale-95
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
      "
      @click="$emit('click')"
    >
      <i class="i-ri:arrow-down-line text-base" />
    </button>
  </Transition>
</template>

<script setup lang="ts">
defineProps<{ isVisible: boolean }>()
defineEmits(['click'])
</script>
