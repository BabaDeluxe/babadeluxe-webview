<template>
  <details
    v-if="reasoning"
    :open="isStreaming"
    class="reasoning-block mb-3 border border-border rounded-lg bg-secondary/30 overflow-hidden"
    data-testid="reasoning-block"
  >
    <summary
      class="reasoning-summary cursor-pointer p-2 flex items-center gap-2 hover:bg-secondary/50 transition-colors list-none"
      data-testid="reasoning-summary"
    >
      <div
        v-if="isStreaming"
        class="w-2 h-2 rounded-full bg-primary animate-pulse"
      />
      <span class="text-sm font-medium text-secondary-foreground/70">
        {{ isStreaming ? 'Thinking\u2026' : 'Reasoning' }}
      </span>
      <span
        v-if="tokenCount > 0"
        class="ml-auto text-xs text-secondary-foreground/50 font-mono"
        data-testid="reasoning-tokens"
      >
        {{ tokenCount }} tokens
      </span>
    </summary>
    <div
      class="reasoning-body p-3 pt-0 text-sm text-secondary-foreground/80 leading-relaxed"
      data-testid="reasoning-content"
    >
      <MarkdownRenderer
        :content="reasoning"
        :cursor="isStreaming"
        :is-streaming="isStreaming"
      />
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import MarkdownRenderer from '@/components/ChatMarkdownRenderer.vue'

const props = defineProps<{
  reasoning: string
  isStreaming: boolean
}>()

import { charsPerToken } from '@/constants'

const tokenCount = computed(() => Math.ceil(props.reasoning.length / charsPerToken))
</script>

<style scoped>
.reasoning-summary::-webkit-details-marker {
  display: none;
}
</style>
