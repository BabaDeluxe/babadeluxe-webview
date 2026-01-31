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

    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="menuRef"
        data-dropdown-layer="true"
        class="bg-panel border border-borderMuted rounded-lg shadow-xl py-1 min-w-40 max-h-[400px] overflow-y-auto z-50 fixed animate-in fade-in slide-in-from-top-2 duration-200"
        :style="menuPositionStyle"
        :data-testid="menuTestId"
      >
        <slot :close="close" />
      </div>
    </Teleport>
  </div>
</template>

ts
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDropdown } from '@/composables/use-dropdown'
import { useTeleportedMenuPosition } from '@/composables/use-teleported-menu-position'

interface BaseDropdownMenuProps {
  triggerClass?: string
  triggerTestId?: string
  menuTestId?: string
  placement?: 'bottom' | 'top' | 'right'
}

const props = withDefaults(defineProps<BaseDropdownMenuProps>(), {
  triggerClass:
    'flex items-center justify-center w-7 h-7 rounded-md hover:bg-borderMuted/20 text-subtleText hover:text-deepText transition-all duration-200 active:scale-95',
  triggerTestId: 'dropdown-trigger',
  menuTestId: 'dropdown-menu',
  placement: 'bottom',
})

const menuRef = ref<HTMLElement | undefined>(undefined)
const { isOpen, containerRef, toggle, close } = useDropdown({ ignore: [menuRef] })

const placementRef = computed(() => props.placement)

const { menuPositionStyle } = useTeleportedMenuPosition({
  triggerRef: containerRef,
  menuRef,
  isOpen,
  placement: placementRef,
})

defineExpose({ close })
</script>
