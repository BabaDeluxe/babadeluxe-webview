<template>
  <div
    v-if="prompts.length === 0"
    class="flex flex-col items-center justify-center gap-3 py-16 text-center"
  >
    <span class="i-bi:chat-square-text text-subtleText text-3xl" />
    <p class="text-sm text-subtleText">No prompts yet.</p>
    <button
      type="button"
      class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-borderMuted bg-panel text-sm text-deepText hover:border-accent/50 transition-colors"
      @click="emit('newPrompt')"
    >
      <span class="i-bi:plus-lg text-sm" /> Create your first prompt
    </button>
  </div>

  <button
    v-for="prompt in prompts"
    :key="prompt.id"
    type="button"
    :aria-pressed="selectedPromptId === prompt.id"
    class="flex flex-col gap-0.5 px-3.5 py-3 rounded-lg border text-left transition-colors relative group"
    :class="[
      selectedPromptId === prompt.id
        ? 'border-accent bg-accentDim'
        : 'border-borderMuted bg-panel hover:border-accent/50',
      prompt.isPremium && !isPro ? 'opacity-80' : '',
    ]"
    :data-testid="'prompt-list-item-' + prompt.id"
    :title="prompt.isPremium && !isPro ? 'Upgrade to Pro to use this prompt' : undefined"
    @click="emit('promptClick', prompt)"
  >
    <div class="flex items-center justify-between gap-2">
      <span class="text-sm font-medium text-deepText truncate">{{ prompt.name }}</span>
      <i
        v-if="prompt.isPremium && !isPro"
        class="i-bi:lock-fill text-accent text-xs"
      />
    </div>
    <span class="text-xs text-subtleText">/{{ prompt.command || '' }}</span>
  </button>
</template>

<script setup lang="ts">
interface Prompt {
  id: number
  name: string
  command?: string
  isPremium?: boolean
}

defineProps<{
  prompts: readonly Prompt[]
  selectedPromptId: number | undefined
  isPro: boolean
}>()

const emit = defineEmits<{
  promptClick: [prompt: Prompt]
  newPrompt: []
}>()
</script>
