import { defineStore } from 'pinia'
import { ref, computed, shallowRef, triggerRef } from 'vue'

type ChunkHandler = (chunk: string) => void
type CompleteHandler = (fullContent: string) => void
type ErrorHandler = (errorMessage: string) => void

export type MessageState = Readonly<{
  onChunk: ChunkHandler | undefined
  onReasoningChunk?: ChunkHandler | undefined
  onComplete: CompleteHandler | undefined
  onError: ErrorHandler | undefined
  isStreaming: boolean
  error?: string
  lastSequence: number
}>

export const useChatSocketStore = defineStore('chatSocket', () => {
  const messageStateById = ref(new Map<number, MessageState>())

  // shallowRef: Map mutations (.set/.delete/.clear) do not auto-track in Vue 3.
  // All mutations must call triggerRef(_reasoningByMessageId) to notify subscribers.
  // Exposed as a readonly computed to prevent external mutation — use appendReasoning() instead.
  const _reasoningByMessageId = shallowRef(new Map<number, string>())
  const reasoningByMessageId = computed(() => _reasoningByMessageId.value)

  const setMessageState = (messageId: number, nextState: MessageState): void => {
    messageStateById.value.set(messageId, nextState)
  }

  const deleteMessageState = (messageId: number): void => {
    messageStateById.value.delete(messageId)
    _reasoningByMessageId.value.delete(messageId)
    triggerRef(_reasoningByMessageId)
  }

  const getMessageState = (messageId: number): MessageState | undefined => {
    return messageStateById.value.get(messageId)
  }

  const resetState = (): void => {
    messageStateById.value.clear()
    _reasoningByMessageId.value.clear()
    triggerRef(_reasoningByMessageId)
  }

  const streamingMessageIds = computed(() => {
    const ids: number[] = []
    for (const [messageId, state] of messageStateById.value.entries()) {
      if (state.isStreaming) ids.push(messageId)
    }
    return ids
  })

  const appendReasoning = (messageId: number, chunk: string): void => {
    const existing = _reasoningByMessageId.value.get(messageId) ?? ''
    _reasoningByMessageId.value.set(messageId, existing + chunk)
    triggerRef(_reasoningByMessageId)
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
