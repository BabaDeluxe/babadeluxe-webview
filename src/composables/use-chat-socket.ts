import { computed, getCurrentScope, onScopeDispose, watch } from 'vue'
import { err, ResultAsync, type Result } from 'neverthrow'
import { loggerKey } from '@/injection-keys'
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
type MessageCompletePayload = { messageId: number; fullContent: string }
type ChatErrorPayload = { messageId?: number; error: string }
type MessageDeletedPayload = { messageId: number }

type AttachedHandlers = Readonly<{
  onChunk: (payload: MessageChunkPayload) => void
  onComplete: (payload: MessageCompletePayload) => void
  onChatError: (payload: ChatErrorPayload) => void
  onDeleted: (payload: MessageDeletedPayload) => void
}>

const handlersBySocket = new WeakMap<object, AttachedHandlers>()

function ensureChatSocketListeners(
  chatSocket: SocketManager['chatSocket'],
  logger: AbstractLogger
): void {
  const store = useChatSocketStore()
  let handlers = handlersBySocket.get(chatSocket)

  if (!handlers) {
    const onChunk = (payload: MessageChunkPayload) => {
      const state = store.getMessageState(payload.messageId)
      if (!state || !Number.isFinite(payload.sequence) || payload.sequence <= state.lastSequence)
        return

      store.setMessageState(payload.messageId, {
        ...state,
        isStreaming: true,
        lastSequence: payload.sequence,
      })

      state.onChunk?.(payload.chunk)
    }

    const onComplete = (payload: MessageCompletePayload) => {
      const state = store.getMessageState(payload.messageId)
      if (!state) return

      state.onComplete?.(payload.fullContent)

      store.setMessageState(payload.messageId, { ...state, isStreaming: false })
      store.deleteMessageState(payload.messageId)
    }

    const onChatError = (payload: ChatErrorPayload) => {
      if (payload.messageId === undefined) {
        logger.warn('Received global chat error without messageId', {
          error: payload.error,
        })
        return
      }
      const state = store.getMessageState(payload.messageId)
      if (!state) return

      state.onError?.(payload.error)

      store.setMessageState(payload.messageId, {
        ...state,
        isStreaming: false,
        error: payload.error,
      })
    }

    const onDeleted = (payload: MessageDeletedPayload) => {
      store.deleteMessageState(payload.messageId)
    }

    handlers = { onChunk, onComplete, onChatError, onDeleted }
    handlersBySocket.set(chatSocket, handlers)
  }

  chatSocket.off('chat:messageChunk', handlers.onChunk)
  chatSocket.off('chat:messageComplete', handlers.onComplete)
  chatSocket.off('chat:chatError', handlers.onChatError)
  chatSocket.off('chat:messageDeleted', handlers.onDeleted)

  chatSocket.on('chat:messageChunk', handlers.onChunk)
  chatSocket.on('chat:messageComplete', handlers.onComplete)
  chatSocket.on('chat:chatError', handlers.onChatError)
  chatSocket.on('chat:messageDeleted', handlers.onDeleted)
}

export function registerStreamingHandlers(
  messageId: number,
  handlers: {
    onChunk?: ChunkHandler
    onComplete?: CompleteHandler
    onError?: ErrorHandler
  }
): void {
  const store = useChatSocketStore()
  const existing = store.getMessageState(messageId)

  store.setMessageState(messageId, {
    onChunk: handlers.onChunk ?? existing?.onChunk,
    onComplete: handlers.onComplete ?? existing?.onComplete,
    onError: handlers.onError ?? existing?.onError,
    isStreaming: true,
    error: undefined,
    lastSequence: 0,
  })
}

export function resetChatSocketStateForTests(): void {
  const store = useChatSocketStore()
  store.resetState()
}

export function useChatSocket() {
  const store = useChatSocketStore()
  const { socketManagerRef } = useSocketManager()
  const logger = safeInject(loggerKey)

  const chatSocketRef = computed(() => socketManagerRef.value?.chatSocket)

  watch(
    chatSocketRef,
    (newSocket) => {
      if (newSocket) ensureChatSocketListeners(newSocket, logger)
    },
    { immediate: true }
  )

  const { createTimeout, cancelTimeout } = useTrackedTimeouts()

  const streamingMessageIds = computed(() => store.streamingMessageIds)

  const isStreaming = computed(() => streamingMessageIds.value.length > 0)

  const error = computed(() => {
    for (const messageId of streamingMessageIds.value) {
      const state = store.getMessageState(messageId)
      if (state?.error) return state.error
    }
    return undefined
  })

  function createStreamCompletion(params: {
    messageId: number
    timeoutId: ReturnType<typeof createTimeout>
    cancelTimeout: (id: ReturnType<typeof createTimeout>) => void
  }) {
    const { messageId, timeoutId, cancelTimeout } = params
    let isDone = false
    let completionError: NetworkError | ChatError | RateLimitError | undefined

    const cleanup = () => {
      if (isDone) return
      isDone = true
      cancelTimeout(timeoutId)
      store.deleteMessageState(messageId)
    }

    const finishOk = () => {
      if (isDone) return
      cleanup()
    }

    const finishError = (error: NetworkError | ChatError | RateLimitError): void => {
      if (isDone) return
      completionError = error
      cleanup()
    }

    return {
      finishOk,
      finishError,
      isDone: () => isDone,
      getError: () => completionError,
    }
  }

  const sendMessageOnce = async (
    messageId: number,
    provider: string,
    modelId: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    handlers: {
      onChunk: (chunk: string) => void
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

        const completion = createStreamCompletion({
          messageId,
          timeoutId,
          cancelTimeout,
        })

        registerStreamingHandlers(messageId, {
          onChunk: handlers.onChunk,
          onComplete: (fullContent) => {
            handlers.onComplete(fullContent)
            completion.finishOk()
            resolve()
          },
          onError: (errorMessage) => {
            handlers.onError?.(errorMessage)
            const error = new ChatError(errorMessage)
            completion.finishError(error)
            reject(error)
          },
        })

        const scope = getCurrentScope()
        if (scope) {
          onScopeDispose(() => {
            if (!completion.isDone()) {
              store.deleteMessageState(messageId)
            }
          })
        }

        const emitResult = chatSocket.emit(
          'chat:sendMessage',
          { messageId, provider, modelId, messages },
          (response: { success: boolean; error?: string }) => {
            if (completion.isDone() || response.success) return

            const errorMessage = response.error ?? 'Unknown error'
            const isRateLimit = errorMessage.toLowerCase().includes('rate limit')

            const error = isRateLimit
              ? new RateLimitError(errorMessage)
              : new ChatError(errorMessage)

            completion.finishError(error)
            reject(error)
          }
        )

        if (!emitResult.isErr()) return

        const error = new NetworkError('Socket emit failed', emitResult.error)
        completion.finishError(error)
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
      onComplete: (fullContent: string) => void
      onError?: (errorMessage: string) => void
    }
  ): Promise<Result<void, NetworkError | ChatError | RateLimitError>> => {
    return retryWithBackoff(
      () => sendMessageOnce(messageId, provider, modelId, messages, handlers),
      `message ${messageId}`,
      { logger }
    )
  }

  const abortMessage = async (
    messageId: number
  ): Promise<Result<void, NetworkError | ChatError>> => {
    const socket = chatSocketRef.value
    if (!socket) {
      return err(new NetworkError('Chat socket not initialized'))
    }

    const connectionResult = await socket.waitForConnection()
    if (connectionResult.isErr()) {
      return err(new NetworkError('Socket connection failed', connectionResult.error))
    }

    ensureChatSocketListeners(socket, logger)
    store.deleteMessageState(messageId)

    return await ResultAsync.fromPromise(
      new Promise<void>((resolve, reject) => {
        const timeoutId = createTimeout(() => {
          reject(new NetworkError('Abort timeout'))
        }, socketTimeoutMs.chatAbort)

        const emitResult = socket.emit(
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
    handlers: { onChunk: (chunk: string) => void; onComplete?: (fullContent: string) => void }
  ): void => {
    registerStreamingHandlers(messageId, {
      onChunk: handlers.onChunk,
      onComplete: handlers.onComplete,
    })
  }

  return {
    isStreaming,
    error,
    streamingMessageIds,
    sendMessage,
    abortMessage,
    isConnected: computed(() => chatSocketRef.value?.isConnected ?? false),
    resumeStreamingMessage,
  }
}
