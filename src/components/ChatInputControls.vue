<template>
  <div class="flex flex-row">
    <BaseDropdown
      :model-value="prompt"
      icon="i-bi:chat-left"
      placement="top"
      :items="promptOptions"
      @update:model-value="emit('update:prompt', $event)"
    />
    <BaseDropdown
      :model-value="model"
      icon="i-simple-icons:openai"
      :groups="modelGroups"
      :is-disabled="isLoadingModels"
      placement="top"
      :data-testid="modelSelectorTestId"
      @update:model-value="emit('update:model', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import BaseDropdown, { type DropdownItem, type DropdownGroup } from '@/components/BaseDropdown.vue'

interface ChatInputControlsProps {
  prompt: string
  model: string
  promptOptions: DropdownItem[]
  modelGroups: DropdownGroup[]
  isLoadingModels: boolean
  modelSelectorTestId?: string
}

withDefaults(defineProps<ChatInputControlsProps>(), {
  modelSelectorTestId: 'model-selector',
})

const emit = defineEmits<{
  (event: 'update:prompt', value: string): void
  (event: 'update:model', value: string): void
}>()
</script>
