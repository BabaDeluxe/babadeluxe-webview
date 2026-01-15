<template>
  <div
    ref="containerRef"
    class="relative"
  >
    <button
      :class="triggerClass"
      :data-testid="triggerTestId"
      @click="toggle"
    >
      <slot name="trigger">
        <i class="i-weui:more-outlined text-lg" />
      </slot>
    </button>

    <div
      v-if="isOpen"
      :class="menuClass"
      :data-testid="menuTestId"
    >
      <slot :close="close" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDropdown } from '@/composables/use-dropdown'

interface BaseDropdownMenuProps {
  triggerClass?: string
  menuClass?: string
  triggerTestId?: string
  menuTestId?: string
}

withDefaults(defineProps<BaseDropdownMenuProps>(), {
  triggerClass:
    'flex items-center justify-center w-7 h-7 rounded-md hover:bg-borderMuted/20 text-subtleText hover:text-deepText transition-all duration-200 active:scale-95',
  menuClass:
    'absolute top-full mt-1 right-0 bg-panel border border-borderMuted rounded-lg shadow-xl py-1 min-w-40 z-20 animate-in fade-in slide-in-from-top-2 duration-200',
  triggerTestId: 'dropdown-trigger',
  menuTestId: 'dropdown-menu',
})

const { isOpen, containerRef, toggle, close } = useDropdown()

defineExpose({ close })
</script>
