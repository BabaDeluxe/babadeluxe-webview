import {} from 'vue'
import { watchDebounced } from '@vueuse/core'
import { useSettings } from '@/composables/use-settings'
import { useModelsSocket } from '@/composables/use-models-socket'

export function useOllamaSettings() {
  const { settings } = useSettings()
  const { reloadModels } = useModelsSocket()

  watchDebounced(
    () => settings.value.find((s) => s.settingKey === 'ollamaUrl')?.settingValue,
    (newValue) => {
      if (newValue) {
        void reloadModels()
      }
    },
    { debounce: 600 }
  )

  return {}
}
