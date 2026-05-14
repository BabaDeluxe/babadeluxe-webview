<template>
  <div class="flex flex-col gap-3">
    <div
      v-for="prompt in prompts"
      :key="prompt.id"
      data-testid="prompt-item"
      class="flex items-center justify-between p-4 bg-panel border border-borderMuted/30 rounded-xl hover:bg-panel-hover hover:border-accent/40 cursor-pointer transition-all shadow-sm group"
      :class="{ 'bg-accent/5 border-accent/60 shadow-md ring-1 ring-accent/20': prompt.id === selectedPromptId }"
      @click="emit('select', prompt.id)"
    >
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <div class="font-semibold text-deepText truncate">{{ prompt.name }}</div>
          <span
            v-if="prompt.isSystem"
            class="text-[10px] font-bold uppercase tracking-wider bg-slate-700/50 text-slate-400 px-1.5 py-0.5 rounded border border-slate-600/30"
          >
            System
          </span>
        </div>
        <div class="text-xs font-mono text-subtleText/80 truncate mt-1">/{{ prompt.command ?? '' }}</div>
      </div>

      <div class="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <BaseButton
          v-if="!prompt.isSystem"
          variant="ghost"
          icon="i-weui:delete-outlined"
          data-testid="prompt-delete-button"
          aria-label="Delete prompt"
          class="w-8 h-8 p-0 hover:text-error hover:bg-error/10"
          title="Delete prompt"
          @click.stop="emit('delete', prompt.id)"
        />
      </div>
    </div>

    <BaseEmptyState
      v-if="prompts.length === 0"
      icon="i-hugeicons:quill-write-02"
      :description="emptyDescription"
      class="border border-borderMuted/20 border-dashed rounded-xl p-8"
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
