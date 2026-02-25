<template>
  <div
    ref="containerRef"
    class="relative"
  >
    <BaseButton
      variant="icon"
      :data-testid="triggerTestId"
      @click="toggle"
    >
      <slot name="trigger">
        <i class="i-weui:more-outlined text-lg" />
      </slot>
    </BaseButton>

    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="menuRef"
        data-dropdown-layer="true"
        class="bg-panel border border-borderMuted rounded-lg shadow-xl py-1 min-w-40 max-h-[400px] overflow-y-auto z-50 fixed animate-fade-in animate-duration-150 animate-ease-out"
        :style="menuPositionStyle"
        :data-testid="menuTestId"
      >
        <slot :close="close" />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseButton from '@/components/BaseButton.vue'
import { useDropdown } from '@/composables/use-dropdown'
import { useTeleportedMenuPosition } from '@/composables/use-teleported-menu-position'

interface BaseDropdownMenuProps {
  triggerTestId?: string
  menuTestId?: string
  placement?: 'bottom' | 'top' | 'right'
}

const props = withDefaults(defineProps<BaseDropdownMenuProps>(), {
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
