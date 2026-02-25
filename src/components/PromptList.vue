<template>
  <div class="flex flex-col gap-2">
    <div
      v-for="prompt in prompts"
      :key="prompt.id"
      data-testid="prompt-item"
      class="flex items-center justify-between p-3 border border-borderMuted rounded-lg hover:bg-panel cursor-pointer transition-colors"
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
        <BaseButton
          v-if="!prompt.isSystem"
          variant="ghost"
          icon="i-weui:delete-outlined"
          data-testid="prompt-delete-button"
          aria-label="Delete prompt"
          class="hover:text-error"
          title="Delete prompt"
          @click.stop="emit('delete', prompt.id)"
        />
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
import BaseButton from '@/components/BaseButton.vue'

interface Prompt {
  id: number
  name: string
  command?: string
  isSystem: boolean
}

interface PromptListProps {
  prompts: readonly Prompt[]
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
