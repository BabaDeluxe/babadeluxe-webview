import { inject, computed, reactive, getCurrentScope, onScopeDispose } from 'vue'
import { err, ok, ResultAsync, type Result } from 'neverthrow'
import { LOGGER_KEY, SOCKET_MANAGER_KEY } from '@/injection-keys'
import { useTrackedTimeouts } from '@/composables/use-tracked-timeouts'
import { ChatError, NetworkError, RateLimitError } from '@/errors'
import type { SocketManager } from '@/socket-manager'

const sendTimeoutMilliseconds = 60_000
const abortTimeoutMilliseconds = 5_000

type ChunkHandler = (chunk: string) => void
type CompleteHandler = (fullContent: string) => void
type ErrorHandler = (errorMessage: string) => void

type MessageState = Readonly<{
  onChunk: ChunkHandler | undefined
  onComplete: CompleteHandler | undefined
  onError: ErrorHandler | undefined
  isStreaming: boolean
  error?: string
  lastSequence: number
}>

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

const messageStateById = reactive(new Map<number, MessageState>())
const handlersBySocket = new WeakMap<object, AttachedHandlers>()

function setMessageState(messageId: number, nextState: MessageState): void {
  messageStateById.set(messageId, nextState)
}

function deleteMessageState(messageId: number): void {
  messageStateById.delete(messageId)
}

function ensureChatSocketListeners(chatSocket: SocketManager): void {
  let handlers = handlersBySocket.get(chatSocket)

  if (!handlers) {
    const onChunk = (payload: MessageChunkPayload) => {
      const state = messageStateById.get(payload.messageId)
      if (!state || !Number.isFinite(payload.sequence)) return

      if (payload.sequence <= state.lastSequence) return

      setMessageState(payload.messageId, {
        ...state,
        isStreaming: true,
        lastSequence: payload.sequence,
      })

      state.onChunk?.(payload.chunk)
    }

    const onComplete = (payload: MessageCompletePayload) => {
      const state = messageStateById.get(payload.messageId)
      if (!state) return

      state.onComplete?.(payload.fullContent)

      setMessageState(payload.messageId, { ...state, isStreaming: false })
      deleteMessageState(payload.messageId)
    }

    const onChatError = (payload: ChatErrorPayload) => {
      if (payload.messageId === undefined) return
      const state = messageStateById.get(payload.messageId)
      if (!state) return

      state.onError?.(payload.error)

      setMessageState(payload.messageId, {
        ...state,
        isStreaming: false,
        error: payload.error,
      })

      deleteMessageState(payload.messageId)
    }

    const onDeleted = (payload: MessageDeletedPayload) => {
      deleteMessageState(payload.messageId)
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
  const existing = messageStateById.get(messageId)

  setMessageState(messageId, {
    onChunk: handlers.onChunk ?? existing?.onChunk,
    onComplete: handlers.onComplete ?? existing?.onComplete,
    onError: handlers.onError ?? existing?.onError,
    isStreaming: true,
    error: undefined,
    lastSequence: 0,
  })
}

export function useChatSocket() {
  const socketManager = inject(SOCKET_MANAGER_KEY)!
  const logger = inject(LOGGER_KEY)!
  const chatSocket = socketManager.chatSocket as SocketManager

  ensureChatSocketListeners(chatSocket)

  const { createTimeout, cancelTimeout } = useTrackedTimeouts()

  const streamingMessageIds = computed(() => {
    const ids: number[] = []
    for (const [messageId, state] of messageStateById.entries()) {
      if (state.isStreaming) ids.push(messageId)
    }
    return ids
  })

  const isStreaming = computed(() => streamingMessageIds.value.length > 0)

  const error = computed(() => {
    for (const messageId of streamingMessageIds.value) {
      const state = messageStateById.get(messageId)
      if (state?.error) return state.error
    }
    return undefined
  })

  const sendMessageOnce = async (
    messageId: number,
    provider: string,
    modelId: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    systemPrompt: string | undefined,
    handlers: {
      onChunk: (chunk: string) => void
      onComplete: (fullContent: string) => void
      onError?: (errorMessage: string) => void
    }
  ): Promise<Result<void, NetworkError | ChatError | RateLimitError>> => {
    const connectionResult = await chatSocket.waitForConnection()
    if (connectionResult.isErr()) {
      logger.error('Failed to connect to chat socket:', connectionResult.error)
      return err(new NetworkError('Socket connection failed', connectionResult.error))
    }

    ensureChatSocketListeners(chatSocket)

    return ResultAsync.fromPromise(
      new Promise<void>((resolve, reject) => {
        let isDone = false

        const finishOk = () => {
          if (isDone) return
          isDone = true
          cancelTimeout(timeoutId)
          resolve()
        }

        const finishError = (errorToReturn: NetworkError | ChatError | RateLimitError) => {
          if (isDone) return
          isDone = true
          cancelTimeout(timeoutId)
          reject(errorToReturn)
        }

        registerStreamingHandlers(messageId, {
          onChunk: handlers.onChunk,
          onComplete: (fullContent) => {
            handlers.onComplete(fullContent)
            finishOk()
          },
          onError: (errorMessage) => {
            handlers.onError?.(errorMessage)
            finishError(new ChatError(errorMessage))
          },
        })

        const scope = getCurrentScope()
        if (scope) {
          onScopeDispose(() => {
            deleteMessageState(messageId)
          })
        }

        const timeoutId = createTimeout(() => {
          logger.error(`Timeout waiting for stream completion for message ${messageId}`)
          deleteMessageState(messageId)
          finishError(new NetworkError('Server timeout'))
        }, sendTimeoutMilliseconds)

        const emitResult = chatSocket.emit(
          'chat:sendMessage',
          { messageId, provider, modelId, messages, systemPrompt },
          (response: { success: boolean; error?: string }) => {
            if (response.success) return

            deleteMessageState(messageId)

            const errorMessage = response.error ?? 'Unknown error'
            if (errorMessage.includes('Rate limit')) {
              finishError(new RateLimitError(errorMessage))
              return
            }

            finishError(new ChatError(errorMessage))
          }
        )

        if (emitResult.isErr()) {
          deleteMessageState(messageId)
          finishError(new NetworkError('Socket emit failed', emitResult.error))
        }
      }),
      (unknownError) => {
        deleteMessageState(messageId)

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
  }

  const sendMessage = async (
    messageId: number,
    provider: string,
    modelId: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    systemPrompt: string | undefined,
    handlers: {
      onChunk: (chunk: string) => void
      onComplete: (fullContent: string) => void
      onError?: (errorMessage: string) => void
    }
  ): Promise<Result<void, NetworkError | ChatError | RateLimitError>> => {
    const maxRetries = 5
    const initialDelayMilliseconds = 1000
    const backoffMultiplier = 2
    const maxDelayMilliseconds = 16_000

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const result = await sendMessageOnce(
        messageId,
        provider,
        modelId,
        messages,
        systemPrompt,
        handlers
      )

      if (result.isOk()) return ok(undefined)
      if (!(result.error instanceof RateLimitError)) return err(result.error)

      const isLastAttempt = attempt === maxRetries - 1
      if (isLastAttempt) return err(result.error)

      const exponentialDelayMilliseconds =
        initialDelayMilliseconds * Math.pow(backoffMultiplier, attempt)
      const jitterMilliseconds = Math.random() * 0.3 * exponentialDelayMilliseconds
      const delayMilliseconds = Math.min(
        exponentialDelayMilliseconds + jitterMilliseconds,
        maxDelayMilliseconds
      )

      logger.warn(
        `Rate limit hit for message ${messageId}. Retrying in ${Math.round(delayMilliseconds)}ms (attempt ${attempt + 1}/${maxRetries})`
      )

      await new Promise((resolve) => setTimeout(resolve, delayMilliseconds))
    }

    return err(new RateLimitError('Max retries exceeded'))
  }

  const abortMessage = async (
    messageId: number
  ): Promise<Result<void, NetworkError | ChatError>> => {
    const connectionResult = await chatSocket.waitForConnection()
    if (connectionResult.isErr()) {
      logger.error('Failed to connect to chat socket for abort:', connectionResult.error)
      return err(new NetworkError('Socket connection failed', connectionResult.error))
    }

    ensureChatSocketListeners(chatSocket)
    deleteMessageState(messageId)

    return ResultAsync.fromPromise(
      new Promise<void>((resolve, reject) => {
        const timeoutId = createTimeout(() => {
          reject(new NetworkError('Abort timeout'))
        }, abortTimeoutMilliseconds)

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
    isConnected: computed(() => chatSocket.isConnected),
    resumeStreamingMessage,
  }
}
