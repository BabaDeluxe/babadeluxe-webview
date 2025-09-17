<template>
  <div class="markdown-content">
    <VueMarkdown :source="_contentWithCursor" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import VueMarkdown from "vue-markdown-render";

const props = withDefaults(
  defineProps<{
    content: string;
    cursor?: boolean;
  }>(),
  {
    cursor: false,
  },
);

const _contentWithCursor = computed(() => {
  if (props.cursor && props.content) {
    return props.content + "▎";
  }
  return props.content;
});
</script>

<style scoped>
.markdown-content :deep(h1) {
  @apply text-xl font-semibold text-deepText mb-3 mt-4 first:mt-0;
}

.markdown-content :deep(h2) {
  @apply text-lg font-semibold text-deepText mb-2 mt-3;
}

.markdown-content :deep(h3) {
  @apply text-base font-semibold text-deepText mb-2 mt-3;
}

.markdown-content :deep(p) {
  @apply text-sm leading-relaxed mb-3 last:mb-0;
  color: inherit;
}

.markdown-content :deep(ul) {
  @apply list-disc list-inside mb-3 space-y-1;
}

.markdown-content :deep(ol) {
  @apply list-decimal list-inside mb-3 space-y-1;
}

.markdown-content :deep(li) {
  @apply text-sm leading-relaxed;
  color: inherit;
}

.markdown-content :deep(blockquote) {
  @apply border-l-4 border-accent bg-panel pl-4 py-2 my-3 italic;
}

.markdown-content :deep(code) {
  @apply bg-codeBg text-accent px-1 py-0.5 rounded text-sm font-mono;
}

.markdown-content :deep(pre) {
  @apply bg-codeBg border border-borderMuted rounded-lg p-4 overflow-x-auto my-3 font-mono text-sm;
}

.markdown-content :deep(pre code) {
  @apply text-subtleText;
  background: transparent !important;
}

.markdown-content :deep(a) {
  @apply text-accent hover:text-accentHover underline transition-colors;
}

.markdown-content :deep(strong) {
  @apply font-semibold text-deepText;
}
</style>
