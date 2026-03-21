import { ref, computed } from 'vue'
import { defaultModel } from '@/constants'

export function useChatInput() {
  const currentMessage = ref('')
  const currentPrompt = ref('BabaSeniorDev™')
  const currentModel = ref(defaultModel)

  const isMessageEmpty = computed(() => !currentMessage.value.trim())

  function clearMessage() {
    currentMessage.value = ''
  }

  return {
    currentMessage,
    currentPrompt,
    currentModel,
    isMessageEmpty,
    clearMessage,
  }
}
