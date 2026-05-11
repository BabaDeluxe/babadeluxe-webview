<template>
  <div
    ref="listRef"
    class="flex flex-col gap-1 overflow-y-auto h-full"
    data-testid="message-list"
  >
    <slot />
    <ScrollToBottomButton
      :is-visible="isVisible"
      @click="scrollToBottom"
    />
  </div>
</template>

<script setup lang="ts">
import { useTemplateRef } from 'vue'
import ScrollToBottomButton from '@/components/ScrollToBottomButton.vue'
import { useScrollToBottom } from '@/composables/use-scroll-to-bottom'

const listRef = useTemplateRef<HTMLElement>('listRef')
const { isVisible, scrollToBottom } = useScrollToBottom(listRef)
</script>
