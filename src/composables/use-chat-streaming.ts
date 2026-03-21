import { computed } from 'vue'
import { useChatSocket } from '@/composables/use-chat-socket'

export function useChatStreaming() {
  const {
    isStreaming: isChatStreaming,
    streamingMessageIds,
    abortMessage: abortChatMessage,
  } = useChatSocket()

  const currentStreamingMessageId = computed(() =>
    streamingMessageIds.value.length > 0 ? streamingMessageIds.value[0] : undefined
  )

  return {
    isChatStreaming,
    currentStreamingMessageId,
    abortChatMessage,
  }
}
