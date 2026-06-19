import { nextTick, type Ref } from 'vue'
import { finalizeStreamingMessage, type StreamingMessageComponent } from '@/streaming-helpers'
import { ChatError } from '@/errors'
import { BaseError } from '@babadeluxe/shared'
import type { Message } from '@/database/types'
import type { AbstractLogger } from '@/logger'
import type { useConversationStore } from '@/stores/use-conversation-store'
import type { useChatStreaming } from '@/composables/use-chat-streaming'
import type { useChatContextHandler } from '@/composables/use-chat-context-handler'
import type { useChatInput } from '@/composables/use-chat-input'
import type { AtPickerItem } from '@/composables/use-at-picker'

export function useChatActions(
  logger: AbstractLogger,
  store: ReturnType<typeof useConversationStore>,
  streaming: ReturnType<typeof useChatStreaming>,
  context: ReturnType<typeof useChatContextHandler>,
  input: ReturnType<typeof useChatInput>,
  currentConversationId: Ref<number>,
  currentUserId: Ref<string | undefined>,
  messages: Ref<Message[]>,
  messageComponents: Ref<Map<number, StreamingMessageComponent>>,
  chatInputRef: Ref<{ focus: () => void; activeSources: AtPickerItem[] } | undefined>,
  getSelectedSystemPromptText: (fallback: string | undefined) => string | undefined,
  ensureConversation: () => Promise<boolean>,
  ensureModel: () => { provider: string; model: string } | null,
  conversationError: Ref<string | undefined>
) {
  const {
    sendMessage: sendConversationMessage,
    resendFromMessage,
    rewriteWithModel,
    finalizeAssistantMessage,
    generateConversationTitle,
    updateConversationTitle,
  } = store

  const { abortChatMessage, isChatStreaming } = streaming
  const { prepareChatRequest, clearAllContext, contextRevision } = context
  const { currentMessage, currentModel, clearMessage } = input

  let streamingAssistantId: number | undefined

  const createError = (fallback: string, errorResult: unknown): BaseError => {
    if (errorResult instanceof BaseError) return errorResult
    if (errorResult instanceof Error) return new ChatError(errorResult.message, errorResult)
    return new ChatError(typeof errorResult === 'string' ? errorResult : fallback)
  }

  const cleanupStreamingMessage = async () => {
    if (streamingAssistantId == null) return

    const msg = messages.value.find((m) => m.id === streamingAssistantId)
    if (msg) msg.isStreaming = false

    const deleteResult = await store.deleteMessage(streamingAssistantId)
    if (deleteResult.isErr()) {
      logger.error('Failed to delete failed assistant message', {
        conversationId: currentConversationId.value,
        userId: currentUserId.value,
        messageId: streamingAssistantId,
        error: deleteResult.error,
      })
    }
  }

  const parseModel = (value: string | undefined): { provider: string; model: string } | null => {
    if (!value || !value.includes(':')) return null
    const [provider, model] = value.split(':')
    return provider && model ? { provider, model } : null
  }

  const handleRegenerateError = (message: string, extra: Record<string, unknown> = {}) => {
    logger.warn(message, {
      conversationId: currentConversationId.value,
      userId: currentUserId.value,
      ...extra,
    })
    conversationError.value = message
  }

  async function handleSendMessage(): Promise<void> {
    if (!currentMessage.value.trim() || isChatStreaming.value) return

    if (!(await ensureConversation())) return

    const modelInfo = ensureModel()
    if (!modelInfo) return

    const { provider, model: selectedModel } = modelInfo
    const messageContent = currentMessage.value
    clearMessage()

    const revisionAtSendStart = contextRevision.value
    const systemPromptText = getSelectedSystemPromptText(undefined)
    const prepared = await prepareChatRequest()

    streamingAssistantId = undefined

    const result = await sendConversationMessage(currentConversationId.value, messageContent, {
      provider,
      model: selectedModel,
      systemPrompt: systemPromptText,
      contextReferences: prepared.contextReferences,
      contextItems: prepared.contextItems,
      onChunk: prepared.onChunk,
      onComplete: async (messageId: number) => {
        streamingAssistantId = messageId
        const msg = messages.value.find((message) => message.id === messageId)
        if (!msg) return

        finalizeStreamingMessage(messageId, messageComponents)
        msg.isStreaming = false

        const finalizeResult = await finalizeAssistantMessage(messageId, msg.content)
        if (finalizeResult.isErr()) {
          logger.error('Failed to persist assistant message', {
            conversationId: currentConversationId.value,
            userId: currentUserId.value,
            messageId,
            error: finalizeResult.error,
          })
          conversationError.value = finalizeResult.error.message
        }

        if (messages.value.length !== 2) return
        const newTitle = generateConversationTitle(messageContent)
        const titleResult = await updateConversationTitle(currentConversationId.value, newTitle)
        if (titleResult.isErr()) {
          logger.warn('Failed to auto-generate conversation title', {
            conversationId: currentConversationId.value,
            userId: currentUserId.value,
            error: titleResult.error,
          })
        }
      },
      onError: async (errorResult: unknown) => {
        const errorText = 'Failed to stream assistant response'
        const asError = createError(errorText, errorResult)
        logger.error(errorText, {
          conversationId: currentConversationId.value,
          userId: currentUserId.value,
          provider,
          model: selectedModel,
          error: asError,
        })
        conversationError.value = asError.message
        await cleanupStreamingMessage()
      },
    })

    if (result.isErr()) {
      conversationError.value = result.error.message
      currentMessage.value = messageContent
      await cleanupStreamingMessage()
      return
    }

    if (contextRevision.value === revisionAtSendStart) clearAllContext()
  }

  async function handleEditMessage(messageId: number, newContent: string) {
    const updateResult = await store.updateUserMessage(messageId, newContent)
    if (updateResult.isErr()) {
      conversationError.value = updateResult.error.message
      return
    }

    const userMessageIndex = messages.value.findIndex((m) => m.id === messageId)
    const nextMessage = messages.value[userMessageIndex + 1]
    if (nextMessage && nextMessage.role !== 'assistant') return

    const fromCurrent = parseModel(currentModel.value)
    if (!fromCurrent) {
      handleRegenerateError('Please select a valid model', {
        messageId,
        currentModel: currentModel.value,
      })
      return
    }

    const { provider, model } = fromCurrent
    const systemPromptText = getSelectedSystemPromptText(nextMessage?.systemPrompt)
    const prepared = await prepareChatRequest()

    await resendFromMessage(currentConversationId.value, messageId, {
      provider,
      model,
      systemPrompt: systemPromptText,
      existingAssistantId: nextMessage?.id,
      contextItems: prepared.contextItems,
      contextReferences: prepared.contextReferences,
      onChunk: prepared.onChunk,
      onError: (errorResult: unknown) => {
        const asError = createError('Failed to regenerate message after edit', errorResult)
        conversationError.value = asError.message
      },
    })
  }

  async function handleRewriteMessage(assistantMessageId: number, newModelId: string) {
    const systemPromptText = getSelectedSystemPromptText(undefined)
    const prepared = await prepareChatRequest()

    await rewriteWithModel(currentConversationId.value, assistantMessageId, newModelId, {
      systemPrompt: systemPromptText,
      contextItems: prepared.contextItems,
      contextReferences: prepared.contextReferences,
      onChunk: prepared.onChunk,
      onComplete: async (messageId: number) => {
        const msg = messages.value.find((message) => message.id === messageId)
        if (!msg) return
        finalizeStreamingMessage(messageId, messageComponents)
        msg.isStreaming = false
      },
      onError: (error: Error) => {
        conversationError.value = error.message
      },
    })
  }

  const handleAbortMessage = async (): Promise<void> => {
    const messageId = streaming.currentStreamingMessageId.value
    if (!messageId) return

    const result = await abortChatMessage(messageId)
    await result.match(
      async () => {
        await nextTick()
        chatInputRef.value?.focus()
      },
      async (abortError) => {
        conversationError.value = abortError.message
      }
    )
  }

  return {
    handleSendMessage,
    handleEditMessage,
    handleRewriteMessage,
    handleAbortMessage,
  }
}
