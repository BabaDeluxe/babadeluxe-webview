import { watch, type Ref } from 'vue'
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
      const hasModelGroups = newModelGroups && newModelGroups.length > 0
      if (!hasModelGroups) return

      for (const modelGroup of newModelGroups) {
        const hasItemsInGroup = modelGroup.items.length > 0
        if (!hasItemsInGroup) continue

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
    (newModelValue) => {
      const trimmedModelValue = newModelValue?.trim()
      if (!trimmedModelValue) {
        selectedModelContextWindow.value = undefined
        return
      }

      selectedModelContextWindow.value = findModelContextWindow(trimmedModelValue)
    },
    { immediate: true }
  )

  return {}
}
