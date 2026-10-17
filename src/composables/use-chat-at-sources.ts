import { computed, type Ref } from 'vue'
import type { AtPickerItem } from '@/composables/use-at-picker'

type PromptItem = {
  id: number
  name: string
  command?: string
  template?: string
  isSystem?: boolean
  isActive?: boolean
}

export function useChatAtSources(
  prompts: Ref<readonly PromptItem[]> | { value: readonly PromptItem[] },
  isLoadingPrompts: Ref<boolean>,
  promptsError: Ref<unknown>
) {
  const availablePromptsAsSources = computed<AtPickerItem[]>(() => {
    return prompts.value.map((prompt) => ({
      id: `prompt:${prompt.id}`,
      label: prompt.name,
      type: 'prompt',
      icon: 'i-hugeicons:quill-write-02',
    }))
  })

  const spaceSources = computed<AtPickerItem[]>(() => [
    {
      id: 'space:coming-soon',
      label: 'Spaces',
      type: 'space',
      icon: 'i-hugeicons:folder-02',
      isDisabled: true,
      disabledReason: 'Coming soon',
    },
  ])

  const superpowerSources = computed<AtPickerItem[]>(() => [
    {
      id: 'superpower:coming-soon',
      label: 'Superpowers',
      type: 'superpower',
      icon: 'i-hugeicons:flash',
      isDisabled: true,
      disabledReason: 'Coming soon',
    },
  ])

  const atSources = computed<AtPickerItem[]>(() => [
    ...availablePromptsAsSources.value,
    ...spaceSources.value,
    ...superpowerSources.value,
  ])

  const promptOptions = computed(() => {
    if (isLoadingPrompts.value) {
      return [{ label: 'Loading Prompts...', value: '', isDisabled: true }]
    }
    if (promptsError.value) {
      return [{ label: 'Error loading prompts', value: '', isDisabled: true }]
    }
    return prompts.value.map((prompt) => ({
      label: prompt.isSystem ? `${prompt.name} (System)` : prompt.name,
      value: prompt.command ?? '',
      isDisabled: !prompt.isActive,
    }))
  })

  return {
    atSources,
    promptOptions,
  }
}
