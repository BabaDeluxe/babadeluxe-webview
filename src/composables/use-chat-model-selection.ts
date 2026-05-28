import { computed, watch, type Ref } from 'vue'
import { findPreferredModel } from '@/model-preferences'
import type { ModelItemGroup, ModelItem } from '@/composables/use-models-socket'

export function useChatModelSelection(
  currentModel: Ref<string>,
  groupedModels: Ref<ModelItemGroup[]>,
  selectedModelContextWindow: Ref<number | undefined>
) {
  const findModelContextWindow = (fullValue: string): number | undefined => {
    if (!fullValue || !fullValue.includes(':')) return undefined

    const allItems: ModelItem[] = groupedModels.value.flatMap((group) => group.items)
    const match = allItems.find((item) => item.value === fullValue)
    return match?.contextWindow
  }

  watch(
    groupedModels,
    (newModelGroups) => {
      if (!newModelGroups || newModelGroups.length === 0) return

      for (const modelGroup of newModelGroups) {
        if (modelGroup.items.length === 0) continue
        const preferredModel = findPreferredModel(modelGroup.items)
        if (preferredModel) {
          currentModel.value = preferredModel.value
          return
        }
      }
    },
    { deep: true }
  )

  watch(
    currentModel,
    (newValue) => {
      const value = newValue?.trim()
      if (!value) {
        selectedModelContextWindow.value = undefined
        return
      }

      selectedModelContextWindow.value = findModelContextWindow(value)
    },
    { immediate: true }
  )

  return {}
}
