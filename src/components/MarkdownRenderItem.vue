<template>
  <div
    class="markdown-content"
    :class="{ 'max-w-screen-md': true }"
  >
    <!-- Committed content (never re-renders during streaming) -->
    <VueMarkdown
      v-if="committedContent"
      :key="committedKey"
      :source="committedContent"
      :plugins="markdownItPlugins"
    />

    <!-- Streaming buffer (plain text, incremental append) -->
    <span
      v-if="isStreaming"
      ref="streamingBufferRef"
      class="streaming-buffer"
      >{{ streamingBuffer
      }}<span
        v-if="cursor"
        class="cursor"
        >▎</span
      ></span
    >
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, useTemplateRef, watch } from 'vue'
import VueMarkdown from 'vue-markdown-render'
import highlightjs from 'markdown-it-highlightjs'

import 'highlight.js/styles/base16/rebecca.css'

// import hljs from 'highlight.js/lib/core'
// import javascript from 'highlight.js/lib/languages/javascript'
// import typescript from 'highlight.js/lib/languages/typescript'
// import python from 'highlight.js/lib/languages/python'
// import bash from 'highlight.js/lib/languages/bash'

// hljs.registerLanguage('javascript', javascript)
// hljs.registerLanguage('typescript', typescript)
// hljs.registerLanguage('python', python)
// hljs.registerLanguage('bash', bash)

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

// Committed content (parsed as markdown, immutable during streaming)
const committedContent = ref('')
const committedKey = ref(0) // Force re-render on commit

// Streaming buffer (plain text, appended incrementally)
const streamingBuffer = ref('')

const streamingBufferRef = useTemplateRef<HTMLSpanElement>('streamingBufferRef')

const markdownItPlugins = [highlightjs]

onMounted(() => {
  if (!props.isStreaming && props.content) {
    committedContent.value = props.content
    committedKey.value++
  }
})

// ✅ FIXED: Handle streaming completion explicitly
watch(
  () => props.isStreaming,
  (isStreaming, wasStreaming) => {
    if (wasStreaming && !isStreaming && props.content) {
      // Streaming complete - commit everything to markdown
      committedContent.value = props.content
      committedKey.value++
      streamingBuffer.value = ''
    }
  }
)

// ✅ FIXED: Separate logic for streaming vs non-streaming
watch(
  () => props.content,
  (newContent) => {
    if (props.isStreaming) {
      // During streaming: only update the plain text buffer
      streamingBuffer.value = newContent.slice(committedContent.value.length)
    } else if (!props.isStreaming && newContent) {
      // ✅ FIXED: Commit on any content change when NOT streaming
      // This ensures non-streaming updates are properly rendered as markdown
      committedContent.value = newContent
      committedKey.value++
      streamingBuffer.value = ''
    }
  }
)

// Expose ref for parent access
defineExpose({
  streamingBufferRef,
  commitContent: () => {
    // Commit current buffer to markdown
    committedContent.value = props.content
    committedKey.value++
    streamingBuffer.value = ''
  },
})
</script>

<style scoped>
.markdown-content {
  @apply w-full;
  max-width: 100%;
  overflow-x: hidden;
}

/* Width constraint for md and above */
@media (min-width: 768px) {
  .markdown-content {
    @apply max-w-[70vw];
  }
}

.streaming-buffer {
  @apply whitespace-pre-wrap break-words text-sm leading-relaxed;
  color: inherit;
}

.cursor {
  @apply animate-pulse;
}

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
  word-break: break-word;
}

.markdown-content :deep(pre) {
  @apply bg-codeBg border border-borderMuted rounded-lg p-4 my-3 font-mono text-sm;
  max-width: 100%;
  overflow-x: auto;
  overflow-wrap: break-word;
  word-wrap: break-word;
}

/* Mobile: Always wrap */
@media (max-width: 767px) {
  .markdown-content :deep(pre) {
    white-space: pre-wrap;
    word-break: break-all;
    overflow-x: hidden;
  }

  .markdown-content :deep(pre code) {
    white-space: pre-wrap;
    word-break: break-all;
  }
}

.markdown-content :deep(pre code) {
  @apply text-subtleText;
  background: transparent !important;
  display: block;
  max-width: 100%;
}

.markdown-content :deep(a) {
  @apply text-accent hover:text-accentHover underline transition-colors;
  word-break: break-word;
}

.markdown-content :deep(strong) {
  @apply font-semibold text-deepText;
}
</style>
