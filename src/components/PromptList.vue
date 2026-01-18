<template>
  <div class="flex flex-col gap-2">
    <div
      v-for="prompt in prompts"
      :key="prompt.id"
      class="flex items-center justify-between p-3 border border-borderMuted rounded-md hover:bg-panel cursor-pointer transition-colors"
      :class="{ 'bg-accent/10 border-accent': prompt.id === selectedPromptId }"
      @click="emit('select', prompt.id)"
    >
      <div class="flex-1 min-w-0">
        <div class="font-medium text-deepText truncate">{{ prompt.name }}</div>
        <div class="text-sm text-subtleText truncate">/{{ prompt.command ?? '' }}</div>
      </div>
      <div class="flex items-center gap-1 flex-shrink-0">
        <span
          v-if="prompt.isSystem"
          class="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full"
        >
          System
        </span>
        <button
          v-if="!prompt.isSystem"
          class="text-subtleText hover:text-error p-1 transition-colors"
          title="Delete prompt"
          @click.stop="emit('delete', prompt.id)"
        >
          <i class="i-weui:delete-outlined" />
        </button>
      </div>
    </div>

    <BaseEmptyState
      v-if="prompts.length === 0"
      icon="i-bi:chat-left"
      :description="emptyDescription"
    />
  </div>
</template>

<script setup lang="ts">
import BaseEmptyState from '@/components/BaseEmptyState.vue'

interface Prompt {
  id: number
  name: string
  command?: string
  isSystem: boolean
}

interface PromptListProps {
  prompts: Prompt[]
  selectedPromptId?: number
  emptyDescription: string
}

withDefaults(defineProps<PromptListProps>(), {
  selectedPromptId: undefined,
})

const emit = defineEmits<{
  select: [promptId: number]
  delete: [promptId: number]
}>()
</script>
