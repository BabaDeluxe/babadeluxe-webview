<template>
  <div
    :ref="refKey"
    class="flex flex-1 min-h-0 relative"
    :class="direction === 'vertical' ? 'flex-col' : 'flex-row'"
  >
    <div
      class="overflow-y-auto pr-2 min-w-0"
      :style="leftStyle"
    >
      <slot name="master" />
    </div>

    <div
      class="relative flex items-center justify-center flex-shrink-0 group touch-none select-none"
      :class="[
        direction === 'vertical' ? 'cursor-row-resize' : 'cursor-col-resize',
        isDragging ? 'bg-accent/10' : '',
      ]"
      @pointerdown="$emit('start-dragging', $event)"
    >
      <div
        :class="[
          'rounded-full transition-all',
          direction === 'vertical' ? 'h-0.5 w-12' : 'w-0.5 h-12',
          isDragging
            ? 'bg-accent ' + (direction === 'vertical' ? 'w-16' : 'h-16')
            : 'bg-borderMuted group-hover:bg-accent ' +
              (direction === 'vertical' ? 'group-hover:w-16' : 'group-hover:h-16'),
        ]"
      />
    </div>

    <div
      class="overflow-y-auto pt-4 pr-2 min-w-0"
      :class="
        direction === 'vertical'
          ? 'border-t border-borderMuted'
          : 'pl-4 border-l border-borderMuted'
      "
      :style="rightStyle"
    >
      <slot name="detail" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  refKey: string
  direction: 'horizontal' | 'vertical'
  leftWidthPercent: string
  rightWidthPercent: string
  isDragging: boolean
}>()

defineEmits(['start-dragging'])

const leftStyle = computed(() => ({
  [props.direction === 'vertical' ? 'height' : 'width']: props.leftWidthPercent,
}))

const rightStyle = computed(() => ({
  [props.direction === 'vertical' ? 'height' : 'width']: props.rightWidthPercent,
}))
</script>
