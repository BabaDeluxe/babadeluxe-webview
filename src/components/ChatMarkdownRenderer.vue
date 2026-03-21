<template>
  <div
    ref="rendererRootRef"
    class="markdown-content min-h-5 overflow-x-hidden"
    @click="handleRootClick"
  >
    <VueMarkdown
      v-if="shouldRenderMarkdown && currentRenderedContent"
      :source="currentRenderedContent"
      :plugins="markdownItPlugins"
      :options="markdownOptions"
    />

    <div
      v-else-if="currentRenderedContent"
      class="plain-content"
    >
      {{ currentRenderedContent }}
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import VueMarkdown from 'vue-markdown-render'
import highlightjs from 'markdown-it-highlightjs'
// @ts-expect-error Missing declaration file
import markdownItKatex from 'markdown-it-katex'
// @ts-expect-error Missing declaration file
import markdownItTaskLists from 'markdown-it-task-lists'
// @ts-expect-error Missing declaration file
import markdownItFootnote from 'markdown-it-footnote'
// @ts-expect-error Missing declaration file
import markdownItSub from 'markdown-it-sub'
// @ts-expect-error Missing declaration file
import markdownItSup from 'markdown-it-sup'
import DOMPurify from 'dompurify'
import type Mermaid from 'mermaid'
import type MarkdownIt from 'markdown-it/index.js'

import 'highlight.js/styles/base16/rebecca.css'
import 'katex/dist/katex.min.css'
import { useTrackedTimeouts } from '@/composables/use-tracked-timeouts'

type ContentTrustLevel = 'trusted' | 'untrusted'

const props = withDefaults(
  defineProps<{
    content: string
    cursor?: boolean
    isStreaming?: boolean
    trustLevel?: ContentTrustLevel
  }>(),
  {
    cursor: false,
    isStreaming: false,
    trustLevel: 'untrusted',
  }
)

const { createTimeout } = useTrackedTimeouts()

const committedContent = ref('')
const currentRenderedContent = computed(() =>
  props.isStreaming ? props.content : committedContent.value
)
const streamingBuffer = ref('')
const streamingBufferRef = useTemplateRef<HTMLSpanElement>('streamingBufferRef')
const rendererRootRef = ref<HTMLElement | null>(null)

let mermaidModule: typeof Mermaid | undefined = undefined

// Track which committed content we've already enhanced
const lastEnhancedContent = ref<string | undefined>()

type MarkdownItFenceToken = {
  info: string
  content: string
}

type MarkdownItFenceRenderer = (
  tokens: MarkdownItFenceToken[],
  index: number,
  options: unknown,
  environment: unknown,
  self: unknown
) => string

type MarkdownItLike = {
  renderer: { rules: Record<string, unknown> }
  utils: { unescapeAll: (value: string) => string; escapeHtml: (value: string) => string }
}

const markdownOptions = computed(() => ({
  html: props.trustLevel === 'trusted',
  breaks: true,
}))

const markdownFenceEnhancer = (md: MarkdownItLike): void => {
  const existingFenceRenderer = md.renderer.rules.fence as MarkdownItFenceRenderer | undefined

  const enhancedFenceRenderer: MarkdownItFenceRenderer = (
    tokens,
    index,
    options,
    environment,
    self
  ) => {
    const token = tokens[index]
    const rawInfo = md.utils.unescapeAll(token.info).trim()
    const firstToken = rawInfo.split(/\s+/)[0] ?? ''
    const lang = firstToken.toLowerCase()

    if (lang === 'mermaid') {
      const escaped = md.utils.escapeHtml(token.content)
      return `<pre class="mermaid">${escaped}</pre>`
    }

    if (lang === 'env') token.info = token.info.replace(/^env\b/i, 'properties')
    if (lang === 'yml') token.info = token.info.replace(/^yml\b/i, 'yaml')

    const rawCode = token.content
    // We inject the button directly into the HTML string to avoid manual DOM insertion later
    // We use a data attribute to store the code for the click handler
    const buttonHtml = `
      <div class="code-block-wrapper relative group">
        <button
          type="button"
          class="code-copy-button absolute top-2 right-2 flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-borderMuted bg-panel/90 cursor-pointer transition-colors transition-opacity opacity-0 group-hover:opacity-100"
          aria-label="Copy code"
          data-code="${md.utils.escapeHtml(rawCode)}"
        >
          <span class="code-copy-icon i-weui:copy-outlined text-xs"></span>
        </button>
    `

    let fenceOutput = ''
    if (existingFenceRenderer) {
      fenceOutput = existingFenceRenderer(tokens, index, options, environment, self)
    } else {
      const escaped = md.utils.escapeHtml(token.content)
      const safeLang = lang ? `language-${lang}` : ''
      fenceOutput = `<pre><code class="${safeLang}">${escaped}</code></pre>`
    }

    return `${buttonHtml}${fenceOutput}</div>`
  }

  // @ts-expect-error Missing declaration file
  md.renderer.rules.fence = enhancedFenceRenderer as unknown as MarkdownIt.RenderRule
}

const markdownItPlugins = [
  highlightjs,
  markdownItKatex,
  markdownItTaskLists,
  markdownItFootnote,
  markdownItSub,
  markdownItSup,
  markdownFenceEnhancer,
]

// Stable markdown/plain decision per committed message
const isMarkdown = ref<boolean | null>(null)

watch(
  () => committedContent.value,
  (value) => {
    if (!value) {
      isMarkdown.value = null
      return
    }
    if (isMarkdown.value === null) {
      isMarkdown.value = isProbablyMarkdown(value)
    }
  },
  { immediate: true }
)

const shouldRenderMarkdown = computed(() => {
  if (props.isStreaming) return true
  return isMarkdown.value === true
})

onMounted(() => {
  if (!props.isStreaming && props.content) {
    committedContent.value = ensureClosedCodeFence(sanitizeContent(props.content))
    void schedulePostRenderEnhancements()
  }
})

watch(
  () => props.isStreaming,
  (isStreaming, wasStreaming) => {
    if (!(wasStreaming && !isStreaming && props.content)) return

    committedContent.value = ensureClosedCodeFence(sanitizeContent(props.content))
    streamingBuffer.value = ''
    void schedulePostRenderEnhancements()
  }
)

watch(
  () => props.content,
  (newContent) => {
    if (props.isStreaming) {
      streamingBuffer.value = newContent.slice(committedContent.value.length)
      return
    }

    if (!newContent) return
    committedContent.value = ensureClosedCodeFence(sanitizeContent(newContent))
    streamingBuffer.value = ''
    void schedulePostRenderEnhancements()
  }
)

async function schedulePostRenderEnhancements(): Promise<void> {
  if (!shouldRenderMarkdown.value || props.isStreaming) return

  const content = committedContent.value
  if (!content || content === lastEnhancedContent.value) return

  lastEnhancedContent.value = content

  await nextTick()

  window.setTimeout(() => {
    void renderMermaidIfPresent()
  }, 0)
}

async function renderMermaidIfPresent(): Promise<void> {
  await nextTick()

  const root = rendererRootRef.value
  if (!root) return

  const nodes = root.querySelectorAll('pre.mermaid') as NodeListOf<HTMLElement>
  if (nodes.length === 0) return

  if (!mermaidModule) {
    const imported = await import('mermaid')

    if (!imported.default?.initialize || typeof imported.default.run !== 'function') {
      throw new Error('Mermaid module has unexpected shape')
    }

    mermaidModule = imported.default
  }

  mermaidModule.initialize({
    startOnLoad: false,
    securityLevel: 'sandbox',
  })

  await mermaidModule.run({ nodes, suppressErrors: true })
}

const handleRootClick = async (event: MouseEvent) => {
  const target = event.target as HTMLElement
  const button = target.closest('.code-copy-button') as HTMLElement
  if (!button) return

  const rawCode = button.getAttribute('data-code')
  if (!rawCode) return

  const textarea = document.createElement('textarea')
  textarea.innerHTML = rawCode
  const decodedCode = textarea.value

  await navigator.clipboard.writeText(decodedCode)

  button.classList.add('is-copied')
  const icon = button.querySelector('.code-copy-icon')
  if (icon) {
    icon.classList.remove('i-weui:copy-outlined')
    icon.classList.add('i-bi-check2')
  }

  createTimeout(() => {
    button.classList.remove('is-copied')
    if (icon) {
      icon.classList.remove('i-bi-check2')
      icon.classList.add('i-weui:copy-outlined')
    }
  }, 1500)
}

function sanitizeContent(text: string): string {
  return DOMPurify.sanitize(text)
}

function ensureClosedCodeFence(text: string): string {
  const fencePattern = /```/g
  let matchCount = 0

  while (fencePattern.exec(text) !== null) {
    matchCount++
  }

  if (matchCount % 2 === 0) return text

  return `${text.trimEnd()}\n\n\`\`\`\n`
}

function isProbablyMarkdown(text: string): boolean {
  const value = text.trim()
  if (value.length < 8) return false

  if (value.includes('```')) return true
  if (/^#{1,6}\s+\S/m.test(value)) return true
  if (/^>\s+\S/m.test(value)) return true
  if (/\|.+\|.+\|/.test(value)) return true

  if (
    /^(\*|-|\+)\s+\S/m.test(value) &&
    /^(?:\*|-|\+)\s+\S/gm.test(value.replace(/^(\*|-|\+)\s+\S/, ''))
  ) {
    return true
  }
  if (/^\d+\.\s+\S/m.test(value) && /^\s*\d+\.\s+\S/gm.test(value.replace(/^\d+\.\s+\S/, ''))) {
    return true
  }

  let score = 0
  if (/\[.+?\]\(.+?\)/.test(value)) score++
  if (/`[^`]+`/.test(value)) score++
  if (/\*\*[^*]+\*\*/.test(value) || /__[^_]+__/.test(value)) score++

  return score >= 2
}

defineExpose({
  streamingBufferRef,
  commitContent: () => {
    committedContent.value = ensureClosedCodeFence(sanitizeContent(props.content))
    streamingBuffer.value = ''
    void schedulePostRenderEnhancements()
  },
})
</script>

<style scoped>
.streaming-buffer {
  @apply whitespace-pre-wrap break-words text-sm leading-relaxed color-inherit;
}

.plain-content {
  @apply whitespace-pre-wrap break-words text-sm leading-relaxed color-inherit;
}

.markdown-content {
  @apply min-h-5 overflow-x-hidden text-sm leading-relaxed text-body-text;
}

.markdown-content :deep(pre.mermaid) {
  @apply bg-transparent border-0 p-0;
}

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

/* Normalize spacing under headings */
.markdown-content :deep(h1 + p),
.markdown-content :deep(h2 + p),
.markdown-content :deep(h3 + p),
.markdown-content :deep(h1 + ul),
.markdown-content :deep(h2 + ul),
.markdown-content :deep(h3 + ul),
.markdown-content :deep(h1 + ol),
.markdown-content :deep(h2 + ol),
.markdown-content :deep(h3 + ol) {
  margin-top: 0.25rem; /* same gap for p and ul/ol */
}

/* Remove default list margins and make them flex columns */
.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  @apply list-none flex flex-col gap-3 m-block-0 pl-0;
}

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

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  @apply list-none margin-block-0;
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

.markdown-content :deep(blockquote) {
  @apply border-l-4 border-accent bg-panel pl-4 py-2 my-3 italic;
}

.markdown-content :deep(code) {
  @apply bg-codeBg px-1 py-0.5 rounded-lgtext-sm font-mono break-words text-bodyText;
}

.markdown-content :deep(pre) {
  @apply bg-codeBg border border-borderMuted rounded-lg p-4 font-mono text-sm max-w-full overflow-x-auto whitespace-pre;
}

.markdown-content :deep(a) {
  @apply text-accent underline transition-colors break-words;
}

.markdown-content :deep(a:hover) {
  @apply text-accentHover;
}

/* Button styles are now injected via tailwind classes in render function, but we keep these for safety/overrides */
.markdown-content :deep(.code-copy-button:hover) {
  @apply bg-panel;
}

.markdown-content :deep(.code-copy-button.is-copied) {
  @apply opacity-80;
}
</style>
