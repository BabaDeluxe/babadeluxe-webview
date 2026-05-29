import { onMounted, watch } from 'vue'
import { useSettings } from '@/composables/use-settings'
import { useModelsSocket } from '@/composables/use-models-socket'

export function useChatModelSelection() {
  const { settings, upsertSetting } = useSettings()
  const { models } = useModelsSocket()

  const handleModelChange = async (modelId: string) => {
    await upsertSetting('lastSelectedModel', modelId, 'string')
  }

  onMounted(() => {
    // Logic for model selection
  })

  watch(models, () => {
    // Handle models update
  })

  return {
    handleModelChange,
    settings,
  }
}
