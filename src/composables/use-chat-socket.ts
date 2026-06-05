import { computed, getCurrentScope, onScopeDispose, watch } from 'vue'
import { err, ResultAsync, type Result } from 'neverthrow'
import { LOGGER_KEY } from '@/injection-keys'
import type { AbstractLogger } from '@/logger'
import { useTrackedTimeouts } from '@/composables/use-tracked-timeouts'
import { ChatError, NetworkError, RateLimitError } from '@/errors'
import type { SocketManager } from '@/socket-manager'
import { safeInject } from '@/safe-inject'
import { socketTimeoutMs } from '@/constants'
import { useSocketManager } from '@/composables/use-socket-manager'
import { retryWithBackoff } from '@/retry'

import { useChatSocketStore } from '@/stores/use-chat-socket-store'

type ChunkHandler = (chunk: string) => void
type CompleteHandler = (fullContent: string) => void
type ErrorHandler = (errorMessage: string) => void

type MessageChunkPayload = { messageId: number; chunk: string; sequence: number }
type ReasoningChunkPayload = { messageId: number; chunk: string; sequence: number }
type MessageCompletePayload = { messageId: number; fullContent: string }
type ChatErrorPayload = { messageId?: number; error: string }
type MessageDeletedPayload = { messageId: number }

type AttachedHandlers = Readonly<{
  onChunk: (payload: MessageChunkPayload) => void
  onReasoningChunk: (payload: ReasoningChunkPayload) => void
  onComplete: (payload: MessageCompletePayload) => void
  onChatError: (payload: ChatErrorPayload) => void
  onDeleted: (payload: MessageDeletedPayload) => void
}>

const handlersBySocket = new WeakMap<object, AttachedHandlers>()

function ensureChatSocketListeners(
  chatSocket: SocketManager['chatSocket'],
  logger: AbstractLogger
): void {
  const socketStore = useChatSocketStore()
  let attachedHandlers = handlersBySocket.get(chatSocket)

  if (!attachedHandlers) {
    const handleMessageChunk = (payload: MessageChunkPayload) => {
      const messageState = socketStore.getMessageState(payload.messageId)
      const isValidSequence =
        Number.isFinite(payload.sequence) && payload.sequence > (messageState?.lastSequence ?? -1)

      if (!messageState || !isValidSequence) return

      socketStore.setMessageState(payload.messageId, {
        ...messageState,
        isStreaming: true,
        lastSequence: payload.sequence,
      })

      messageState.onChunk?.(payload.chunk)
    }

    const handleReasoningChunk = (payload: ReasoningChunkPayload) => {
      const messageState = socketStore.getMessageState(payload.messageId)
      if (!messageState) return

      socketStore.appendReasoning(payload.messageId, payload.chunk)
      messageState.onReasoningChunk?.(payload.chunk)
    }

    const handleMessageComplete = (payload: MessageCompletePayload) => {
      const messageState = socketStore.getMessageState(payload.messageId)
      if (!messageState) return

      messageState.onComplete?.(payload.fullContent)

      socketStore.setMessageState(payload.messageId, { ...messageState, isStreaming: false })
      socketStore.deleteMessageState(payload.messageId)
    }

    const handleChatError = (payload: ChatErrorPayload) => {
      if (payload.messageId === undefined) {
        logger.warn('Received global chat error without messageId', {
          error: payload.error,
        })
        return
      }
      const messageState = socketStore.getMessageState(payload.messageId)
      if (!messageState) return

      messageState.onError?.(payload.error)

      socketStore.setMessageState(payload.messageId, {
        ...messageState,
        isStreaming: false,
        error: payload.error,
      })
    }

    const handleMessageDeleted = (payload: MessageDeletedPayload) => {
      socketStore.deleteMessageState(payload.messageId)
    }

    attachedHandlers = {
      onChunk: handleMessageChunk,
      onReasoningChunk: handleReasoningChunk,
      onComplete: handleMessageComplete,
      onChatError: handleChatError,
      onDeleted: handleMessageDeleted,
    }
    handlersBySocket.set(chatSocket, attachedHandlers)
  }

  chatSocket.off('chat:messageChunk', attachedHandlers.onChunk)
  // TODO(#issue): add chat:reasoningChunk to socket Emission type — event exists on server but not yet in shared Emission map
  chatSocket.off('chat:reasoningChunk', attachedHandlers.onReasoningChunk)
  chatSocket.off('chat:messageComplete', attachedHandlers.onComplete)
  chatSocket.off('chat:chatError', attachedHandlers.onChatError)
  chatSocket.off('chat:messageDeleted', attachedHandlers.onDeleted)

  chatSocket.on('chat:messageChunk', attachedHandlers.onChunk)
  // TODO(#issue): add chat:reasoningChunk to socket Emission type — event exists on server but not yet in shared Emission map
  chatSocket.on('chat:reasoningChunk', attachedHandlers.onReasoningChunk)
  chatSocket.on('chat:messageComplete', attachedHandlers.onComplete)
  chatSocket.on('chat:chatError', attachedHandlers.onChatError)
  chatSocket.on('chat:messageDeleted', attachedHandlers.onDeleted)
}

export function registerStreamingHandlers(
  messageId: number,
  handlers: {
    onChunk?: ChunkHandler
    onReasoningChunk?: ChunkHandler
    onComplete?: CompleteHandler
    onError?: ErrorHandler
  }
): void {
  const socketStore = useChatSocketStore()
  const existingState = socketStore.getMessageState(messageId)

  socketStore.setMessageState(messageId, {
    onChunk: handlers.onChunk ?? existingState?.onChunk,
    onReasoningChunk: handlers.onReasoningChunk ?? existingState?.onReasoningChunk,
    onComplete: handlers.onComplete ?? existingState?.onComplete,
    onError: handlers.onError ?? existingState?.onError,
    isStreaming: true,
    error: undefined,
    lastSequence: 0,
  })
}

export function resetChatSocketStateForTests(): void {
  const socketStore = useChatSocketStore()
  socketStore.resetState()
}

export function useChatSocket() {
  const socketStore = useChatSocketStore()
  const { socketManagerRef } = useSocketManager()
  const logger = safeInject(LOGGER_KEY)

  const chatSocketRef = computed(() => socketManagerRef.value?.chatSocket)

  watch(
    chatSocketRef,
    (newSocket) => {
      if (newSocket) ensureChatSocketListeners(newSocket, logger)
    },
    { immediate: true }
  )

  const { createTimeout, cancelTimeout } = useTrackedTimeouts()

  const streamingMessageIds = computed(() => socketStore.streamingMessageIds)

  const isStreaming = computed(() => streamingMessageIds.value.length > 0)

  const streamingError = computed(() => {
    for (const messageId of streamingMessageIds.value) {
      const messageState = socketStore.getMessageState(messageId)
      if (messageState?.error) return messageState.error
    }
    return undefined
  })

  function createStreamCompletionTracker(params: {
    messageId: number
    timeoutId: ReturnType<typeof createTimeout>
    cancelTimeout: (id: ReturnType<typeof createTimeout>) => void
  }) {
    const { messageId, timeoutId, cancelTimeout } = params
    let isCompletionDone = false
    let finalCompletionError: NetworkError | ChatError | RateLimitError | undefined

    const cleanupResources = () => {
      if (isCompletionDone) return
      isCompletionDone = true
      cancelTimeout(timeoutId)
      socketStore.deleteMessageState(messageId)
    }

    const markAsFinishedSuccessfully = () => {
      if (isCompletionDone) return
      cleanupResources()
    }

    const markAsFinishedWithError = (error: NetworkError | ChatError | RateLimitError): void => {
      if (isCompletionDone) return
      finalCompletionError = error
      cleanupResources()
    }

    return {
      finishOk: markAsFinishedSuccessfully,
      finishError: markAsFinishedWithError,
      isDone: () => isCompletionDone,
      getError: () => finalCompletionError,
    }
  }

  const attemptToSendMessage = async (
    messageId: number,
    provider: string,
    modelId: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    handlers: {
      onChunk: (chunk: string) => void
      onReasoningChunk?: (chunk: string) => void
      onComplete: (fullContent: string) => void
      onError?: (errorMessage: string) => void
    }
  ): Promise<Result<void, NetworkError | ChatError | RateLimitError>> => {
    const chatSocket = chatSocketRef.value
    if (!chatSocket) {
      return err(new NetworkError('Chat socket not initialized'))
    }

    const connectionResult = await chatSocket.waitForConnection()
    if (connectionResult.isErr()) {
      logger.error('Failed to connect to chat socket:', connectionResult.error)
      return err(new NetworkError('Socket connection failed', connectionResult.error))
    }

    ensureChatSocketListeners(chatSocket, logger)

    const sendTimeoutMilliseconds = socketTimeoutMs.chatSend

    const result = await ResultAsync.fromPromise(
      new Promise<void>((resolve, reject) => {
        const timeoutId = createTimeout(() => {
          logger.error(`Timeout waiting for stream completion for message ${messageId}`)
          const error = new NetworkError('Server timeout')
          reject(error)
        }, sendTimeoutMilliseconds)

        const completionTracker = createStreamCompletionTracker({
          messageId,
          timeoutId,
          cancelTimeout,
        })

        registerStreamingHandlers(messageId, {
          onChunk: handlers.onChunk,
          onReasoningChunk: handlers.onReasoningChunk,
          onComplete: (fullContent) => {
            handlers.onComplete(fullContent)
            completionTracker.finishOk()
            resolve()
          },
          onError: (errorMessage) => {
            handlers.onError?.(errorMessage)
            const error = new ChatError(errorMessage)
            completionTracker.finishError(error)
            reject(error)
          },
        })

        const activeScope = getCurrentScope()
        if (activeScope) {
          onScopeDispose(() => {
            if (!completionTracker.isDone()) {
              socketStore.deleteMessageState(messageId)
            }
          })
        }

        const emitResult = chatSocket.emit(
          'chat:sendMessage',
          { messageId, provider, modelId, messages },
          (response: { success: boolean; error?: string }) => {
            if (completionTracker.isDone() || response.success) return

            const errorMessage = response.error ?? 'Unknown error'
            const isRateLimitError = errorMessage.toLowerCase().includes('rate limit')

            const error = isRateLimitError
              ? new RateLimitError(errorMessage)
              : new ChatError(errorMessage)

            completionTracker.finishError(error)
            reject(error)
          }
        )

        if (!emitResult.isErr()) return

        const error = new NetworkError('Socket emit failed', emitResult.error)
        completionTracker.finishError(error)
        reject(error)
      }),
      (unknownError) => {
        if (
          unknownError instanceof NetworkError ||
          unknownError instanceof ChatError ||
          unknownError instanceof RateLimitError
        ) {
          return unknownError
        }

        return new ChatError(
          'Failed to send message',
          unknownError instanceof Error ? unknownError : undefined
        )
      }
    )

    return result
  }

  const sendMessage = async (
    messageId: number,
    provider: string,
    modelId: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    handlers: {
      onChunk: (chunk: string) => void
      onReasoningChunk?: (chunk: string) => void
      onComplete: (fullContent: string) => void
      onError?: (errorMessage: string) => void
    }
  ): Promise<Result<void, NetworkError | ChatError | RateLimitError>> => {
    return retryWithBackoff(
      () => attemptToSendMessage(messageId, provider, modelId, messages, handlers),
      `message ${messageId}`,
      { logger }
    )
  }

  const abortMessage = async (
    messageId: number
  ): Promise<Result<void, NetworkError | ChatError>> => {
    const chatSocket = chatSocketRef.value
    if (!chatSocket) {
      return err(new NetworkError('Chat socket not initialized'))
    }

    const connectionResult = await chatSocket.waitForConnection()
    if (connectionResult.isErr()) {
      return err(new NetworkError('Socket connection failed', connectionResult.error))
    }

    ensureChatSocketListeners(chatSocket, logger)
    socketStore.deleteMessageState(messageId)

    return await ResultAsync.fromPromise(
      new Promise<void>((resolve, reject) => {
        const timeoutId = createTimeout(() => {
          reject(new NetworkError('Abort timeout'))
        }, socketTimeoutMs.chatAbort)

        const emitResult = chatSocket.emit(
          'chat:abortMessage',
          { messageId, deleteMessage: false },
          (response: { success: boolean; error?: string }) => {
            cancelTimeout(timeoutId)
            if (response.success) resolve()
            else reject(new ChatError(response.error ?? 'Abort failed'))
          }
        )

        if (emitResult.isErr()) {
          cancelTimeout(timeoutId)
          reject(new NetworkError('Socket emit failed', emitResult.error))
        }
      }),
      (unknownError) => {
        if (unknownError instanceof NetworkError || unknownError instanceof ChatError) {
          return unknownError
        }

        return new ChatError(
          'Abort failed',
          unknownError instanceof Error ? unknownError : undefined
        )
      }
    )
  }

  const resumeStreamingMessage = (
    messageId: number,
    handlers: {
      onChunk: (chunk: string) => void
      onReasoningChunk?: (chunk: string) => void
      onComplete?: (fullContent: string) => void
    }
  ): void => {
    registerStreamingHandlers(messageId, {
      onChunk: handlers.onChunk,
      onReasoningChunk: handlers.onReasoningChunk,
      onComplete: handlers.onComplete,
    })
  }

  return {
    isStreaming,
    error: streamingError,
    streamingMessageIds,
    sendMessage,
    abortMessage,
    isConnected: computed(() => chatSocketRef.value?.isConnected ?? false),
    resumeStreamingMessage,
  }
}
