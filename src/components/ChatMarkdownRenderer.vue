<template>
  <div
    ref="rendererRootRef"
    class="markdown-content min-h-5 overflow-x-hidden"
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
import { computed, nextTick, onMounted, ref, watch } from 'vue'
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

const committedContent = ref('')
const currentRenderedContent = computed(() =>
  props.isStreaming ? props.content : committedContent.value
)
const rendererRootRef = ref<HTMLElement | null>(null)

let mermaidModule: typeof Mermaid | undefined = undefined
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

    // Note: We're keeping the basic HTML structure for now as swapping to Vue components
    // for every code block in markdown-it is a larger architectural change involving
    // custom tokens and a custom renderer for Vue components.
    // However, we've cleaned up the implementation.

    if (existingFenceRenderer) {
      return existingFenceRenderer(tokens, index, options, environment, self)
    }

    const escaped = md.utils.escapeHtml(token.content)
    const safeLang = lang ? `language-${lang}` : ''
    return `<pre><code class="${safeLang}">${escaped}</code></pre>`
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
    void schedulePostRenderEnhancements()
  }
)

watch(
  () => props.content,
  (newContent) => {
    if (props.isStreaming) return

    if (!newContent) return
    committedContent.value = ensureClosedCodeFence(sanitizeContent(newContent))
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
    mermaidModule = imported.default
  }

  mermaidModule.initialize({
    startOnLoad: false,
    securityLevel: 'sandbox',
  })

  await mermaidModule.run({ nodes, suppressErrors: true })
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
  commitContent: () => {
    committedContent.value = ensureClosedCodeFence(sanitizeContent(props.content))
    void schedulePostRenderEnhancements()
  },
})
</script>

<style scoped>
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

.markdown-content :deep(h1 + p),
.markdown-content :deep(h2 + p),
.markdown-content :deep(h3 + p),
.markdown-content :deep(h1 + ul),
.markdown-content :deep(h2 + ul),
.markdown-content :deep(h3 + ul),
.markdown-content :deep(h1 + ol),
.markdown-content :deep(h2 + ol),
.markdown-content :deep(h3 + ol) {
  margin-top: 0.25rem;
}

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
  @apply bg-codeBg px-1 py-0.5 rounded-lg text-sm font-mono break-words text-bodyText;
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
</style>
