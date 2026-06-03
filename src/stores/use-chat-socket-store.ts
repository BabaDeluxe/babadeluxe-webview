import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

type ChunkHandler = (chunk: string) => void
type CompleteHandler = (fullContent: string) => void
type ErrorHandler = (errorMessage: string) => void

export type MessageState = Readonly<{
  onChunk: ChunkHandler | undefined
  onReasoningChunk: ChunkHandler | undefined
  onComplete: CompleteHandler | undefined
  onError: ErrorHandler | undefined
  isStreaming: boolean
  error?: string
  lastSequence: number
}>

export const useChatSocketStore = defineStore('chatSocket', () => {
  const messageStateById = ref(new Map<number, MessageState>())
  const reasoningByMessageId = ref(new Map<number, string>())

  const setMessageState = (messageId: number, nextState: MessageState): void => {
    messageStateById.value.set(messageId, nextState)
  }

  const deleteMessageState = (messageId: number): void => {
    messageStateById.value.delete(messageId)
    reasoningByMessageId.value.delete(messageId)
  }

  const getMessageState = (messageId: number): MessageState | undefined => {
    return messageStateById.value.get(messageId)
  }

  const resetState = (): void => {
    messageStateById.value.clear()
    reasoningByMessageId.value.clear()
  }

  const streamingMessageIds = computed(() => {
    const ids: number[] = []
    for (const [messageId, state] of messageStateById.value.entries()) {
      if (state.isStreaming) ids.push(messageId)
    }
    return ids
  })

  const appendReasoning = (messageId: number, chunk: string): void => {
    const existing = reasoningByMessageId.value.get(messageId) ?? ''
    reasoningByMessageId.value.set(messageId, existing + chunk)
  }

  return {
    messageStateById,
    reasoningByMessageId,
    setMessageState,
    deleteMessageState,
    getMessageState,
    resetState,
    streamingMessageIds,
    appendReasoning,
  }
})
