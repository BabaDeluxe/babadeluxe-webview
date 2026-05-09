<template>
  <div
    ref="listRef"
    class="flex flex-col gap-1 overflow-y-auto h-full"
    data-testid="message-list"
  >
    <slot />
    <ScrollToBottomButton :scroll-el="listRef ?? undefined" />
  </div>
</template>

<script setup lang="ts">
import { useTemplateRef } from 'vue'
import ScrollToBottomButton from '@/components/ScrollToBottomButton.vue'

const listRef = useTemplateRef<HTMLElement>('listRef')
</script>
