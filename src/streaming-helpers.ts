import type { Ref } from 'vue'
import type { Message } from '@/database/types'

export interface StreamingMessageComponent {
  markdownRef?: {
    commitContent: () => void
  } | null
}

export function createStreamingCommitHandler(
  messages: Ref<Message[]>,
  messageComponents: Ref<Map<number, StreamingMessageComponent>>,
  commitIntervalMs: number
) {
  let lastCommitTime = Date.now()

  return (messageId: number) => {
    const message = messages.value.find((message) => message.id === messageId)
    if (!message) return

    if (!message.isStreaming) message.isStreaming = true

    const now = Date.now()
    if (!(now - lastCommitTime > commitIntervalMs)) return

    const componentInstance = messageComponents.value.get(messageId)
    if (componentInstance?.markdownRef) {
      componentInstance.markdownRef.commitContent()
    }
    lastCommitTime = now
  }
}

export function finalizeStreamingMessage(
  messageId: number,
  messageComponents: Ref<Map<number, StreamingMessageComponent>>
): Ref<Map<number, StreamingMessageComponent>> {
  const componentInstance = messageComponents.value.get(messageId)
  if (componentInstance?.markdownRef) {
    componentInstance.markdownRef.commitContent()
  }
  messageComponents.value.delete(messageId)
  return messageComponents
}
