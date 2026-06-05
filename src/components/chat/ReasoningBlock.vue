<template>
  <details
    v-if="reasoning"
    class="mb-2 group border border-borderMuted rounded-lg bg-surface/30 overflow-hidden"
  >
    <summary
      class="flex items-center gap-2 cursor-pointer list-none text-xs text-subtleText hover:text-accent transition-all select-none px-3 py-2 bg-surface/50"
    >
      <span class="i-hugeicons:brain w-3.5 h-3.5 text-accent" />
      <span class="font-semibold tracking-wide uppercase text-[10px]">Reasoning</span>
      <span
        v-if="isStreaming"
        class="flex gap-0.5 ml-1"
      >
        <span class="w-1 h-1 bg-accent rounded-full animate-pulse" />
        <span class="w-1 h-1 bg-accent rounded-full animate-pulse [animation-delay:0.2s]" />
        <span class="w-1 h-1 bg-accent rounded-full animate-pulse [animation-delay:0.4s]" />
      </span>
      <span
        class="i-hugeicons:arrow-right-01 w-3 h-3 transition-transform group-open:rotate-90 ml-auto opacity-50"
      />
    </summary>
    <div
      class="px-4 py-3 text-xs text-deepText/80 leading-relaxed border-t border-borderMuted/30 whitespace-pre-wrap font-mono bg-panel/20 max-h-96 overflow-y-auto"
    >
      {{ reasoning }}
    </div>
  </details>
</template>

<script setup lang="ts">
defineProps<{
  reasoning?: string
  isStreaming?: boolean
}>()
</script>

<style scoped>
summary::-webkit-details-marker {
  display: none;
}
details[open] summary {
  @apply border-b border-borderMuted/30;
}
</style>
