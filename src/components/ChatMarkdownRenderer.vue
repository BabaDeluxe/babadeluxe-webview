<template>
  <div class="markdown-content min-h-5 pr-6 overflow-x-hidden">
    <VueMarkdown
      v-if="committedContent"
      :key="committedKey"
      :source="committedContent"
      :plugins="markdownItPlugins"
    />

    <span
      v-if="isStreaming"
      ref="streamingBufferRef"
      class="streaming-buffer"
    >
      {{ streamingBuffer }}
      <span
        v-if="cursor"
        class="animate-pulse"
        >▎</span
      >
    </span>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, useTemplateRef, watch } from 'vue'
import VueMarkdown from 'vue-markdown-render'
import highlightjs from 'markdown-it-highlightjs'

import 'highlight.js/styles/base16/rebecca.css'

const props = withDefaults(
  defineProps<{
    content: string
    cursor?: boolean
    isStreaming?: boolean
  }>(),
  {
    cursor: false,
    isStreaming: false,
  }
)

const committedContent = ref('')
const committedKey = ref(0)
const streamingBuffer = ref('')
const streamingBufferRef = useTemplateRef<HTMLSpanElement>('streamingBufferRef')
const markdownItPlugins = [highlightjs]

onMounted(() => {
  if (!props.isStreaming && props.content) {
    committedContent.value = props.content
    committedKey.value++
  }
})

watch(
  () => props.isStreaming,
  (isStreaming, wasStreaming) => {
    if (!(wasStreaming && !isStreaming && props.content)) return

    committedContent.value = props.content
    committedKey.value++
    streamingBuffer.value = ''
  }
)

watch(
  () => props.content,
  (newContent) => {
    if (props.isStreaming) {
      streamingBuffer.value = newContent.slice(committedContent.value.length)
    } else if (!props.isStreaming && newContent) {
      committedContent.value = newContent
      committedKey.value++
      streamingBuffer.value = ''
    }
  }
)

defineExpose({
  streamingBufferRef,
  commitContent: () => {
    committedContent.value = props.content
    committedKey.value++
    streamingBuffer.value = ''
  },
})
</script>

<style scoped>
.streaming-buffer {
  @apply whitespace-pre-wrap break-words text-sm leading-relaxed color-inherit;
}

/* Base typography + base text color (scoped, safe) */
.markdown-content {
  @apply min-h-5 pr-6 overflow-x-hidden text-sm leading-relaxed text-body-text;
}

/* Headings (anchored deep selectors) */
.markdown-content :deep(h1) {
  @apply text-xl font-semibold text-heading-text;
  color: #dcd8ff;
}

.markdown-content :deep(h2) {
  @apply text-lg font-semibold text-heading-text;
  color: #dcd8ff;
}

.markdown-content :deep(h3) {
  @apply text-base font-semibold text-heading-text;
  color: #dcd8ff;
}

/* Paragraphs */
.markdown-content :deep(p) {
  @apply text-sm leading-normal m-0;
}

.markdown-content :deep(strong) {
  @apply font-semibold text-heading-text;
  color: #dcd8ff;
}

.markdown-content :deep(p:has(+ ul)),
.markdown-content :deep(p:has(+ ol)) {
  @apply leading-tight;
}

/* Lists */
.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  @apply list-none;
  margin-block-end: 0;
  margin-block-start: 0;
  margin-inline-start: 0;
  margin-inline-end: 0;
}

.markdown-content :deep(ul > li),
.markdown-content :deep(ol > li) {
  @apply text-sm leading-normal color-inherit;
}

.markdown-content :deep(ol > li) {
  counter-increment: list-counter;
}

.markdown-content :deep(ul > li::before) {
  content: '• ';
  color: inherit;
}

.markdown-content :deep(ol > li)::before {
  content: counter(list-counter) '. ';
  color: inherit;
}

/* Quotes */
.markdown-content :deep(blockquote) {
  @apply border-l-4 border-accent bg-panel pl-4 py-2 my-3 italic;
}

/* Inline code + code blocks */
.markdown-content :deep(code) {
  @apply bg-codeBg px-1 py-0.5 rounded text-sm font-mono break-words text-bodyText;
}

.markdown-content :deep(pre) {
  @apply bg-codeBg border border-borderMuted rounded-lg p-4 font-mono text-sm max-w-full overflow-x-auto whitespace-pre;
}

/* Links */
.markdown-content :deep(a) {
  @apply text-accent underline transition-colors break-words;
}

/* NOTE: hover color name should likely be kebab-case if it's camelCase in theme (see question below). */
.markdown-content :deep(a:hover) {
  @apply text-accentHover;
}
</style>
