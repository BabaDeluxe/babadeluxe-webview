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
        class="cursor"
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

.cursor {
  @apply animate-pulse;
}

.markdown-content :deep(h1) {
  @apply text-xl font-semibold text-deepText;
}

.markdown-content :deep(h2) {
  @apply text-lg font-semibold text-deepText;
}

.markdown-content :deep(h3) {
  @apply text-base font-semibold text-deepText;
}

.markdown-content :deep(p) {
  @apply text-sm leading-normal color-inherit;
}

.markdown-content :deep(p:has(+ ul)),
.markdown-content :deep(p:has(+ ol)) {
  @apply leading-tight;
}

.markdown-content :deep(ul) {
  @apply list-none;
}

.markdown-content :deep(ol) {
  @apply list-none;
  counter-reset: list-counter;
}

.markdown-content :deep(ul > li),
.markdown-content :deep(ol > li) {
  @apply text-sm leading-normal;
  color: inherit;
}

.markdown-content :deep(ul > li + li),
.markdown-content :deep(ol > li + li) {
  @apply mt-4;
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

.markdown-content :deep(blockquote) {
  @apply border-l-4 border-accent bg-panel pl-4 py-2 my-3 italic;
}

.markdown-content :deep(code) {
  @apply bg-codeBg text-accent px-1 py-0.5 rounded text-sm font-mono break-words;
}

.markdown-content :deep(pre) {
  @apply bg-codeBg border border-borderMuted rounded-lg p-4 my-3 font-mono text-sm max-w-full overflow-x-auto whitespace-pre;
}

@media (max-width: 767px) {
  .markdown-content :deep(pre) {
    @apply whitespace-pre-wrap break-all overflow-x-hidden;
  }
}

.markdown-content :deep(pre code) {
  @apply text-subtleText block max-w-full;
  background: transparent !important;
}

.markdown-content :deep(a) {
  @apply text-accent hover:text-accentHover underline transition-colors break-words;
}

.markdown-content :deep(strong) {
  @apply font-semibold text-deepText;
}
</style>
