<template>
  <article
    class="flex flex-col w-full sm:w-auto sm:flex-row flex-1 gap-3 py-2 px-2 items-start rounded-lg h-auto w-full lg:max-w-80vw"
    :class="alignmentClass"
  >
    <slot name="avatar" />

    <div
      ref="contentWrapperRef"
      class="flex flex-col flex-1 w-full rounded-lg px-2 py-2 text-sm whitespace-pre-wrap break-words relative transition-all duration-200"
      :class="bubbleClass"
    >
      <slot />

      <div
        v-if="$slots.actions"
        class="absolute top-1 right-1"
      >
        <slot name="actions" />
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface BaseMessageBubbleProps {
  variant?: 'primary' | 'secondary'
  align?: 'left' | 'right'
}

const props = withDefaults(defineProps<BaseMessageBubbleProps>(), {
  variant: 'primary',
  align: 'left',
})

const bubbleClass = computed(() => {
  const variants = {
    primary: 'bg-panel text-deepText border border-borderMuted',
    secondary: 'bg-codeBg text-subtleText border border-borderMuted',
  }
  return variants[props.variant]
})

const alignmentClass = computed(() => {
  return props.align === 'right' ? 'items-end sm:flex-row-reverse' : 'self-start flex-row'
})
</script>
