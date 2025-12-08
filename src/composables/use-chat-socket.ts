import { inject, computed, getCurrentScope, onScopeDispose } from 'vue'
import { err, ResultAsync, type Result } from 'neverthrow'
import { LOGGER_KEY, SOCKET_MANAGER_KEY } from '@/injection-keys'
import { useTrackedTimeouts } from './use-tracked-timeouts'
import {
  registerChunkHandler,
  unregisterChunkHandler,
  getAllStreamingMessageIds,
  getChatSocketState,
} from '@/chat-socket-listener'
import { ChatError, NetworkError, RateLimitError } from '@/errors'

const sendTimeoutMs = 60_000
const abortTimeoutMs = 5_000

export function useChatSocket() {
  const socketManager = inject(SOCKET_MANAGER_KEY)!
  const logger = inject(LOGGER_KEY)!
  const chatSocket = socketManager.chatSocket

  const { createTimeout, cancelTimeout } = useTrackedTimeouts()

  const streamingMessageIds = computed(() => getAllStreamingMessageIds())
  const isStreaming = computed(() => streamingMessageIds.value.length > 0)
  const error = computed(() => {
    const ids = streamingMessageIds.value
    if (ids.length === 0) return undefined
    for (const id of ids) {
      const state = getChatSocketState(id)
      if (state.error) return state.error
    }
    return undefined
  })

  const _sendMessageOnce = async (
    messageId: number,
    provider: string,
    modelId: string,
    prompt: string,
    onChunk: (chunk: string) => void
  ): Promise<Result<void, NetworkError | ChatError | RateLimitError>> => {
    const connectionResult = await chatSocket.waitForConnection()

    if (connectionResult.isErr()) {
      logger.error('Failed to connect to chat socket:', connectionResult.error)
      return err(new NetworkError('Socket connection failed', connectionResult.error))
    }

    registerChunkHandler(messageId, onChunk)

    const scope = getCurrentScope()
    const unregister = () => {
      unregisterChunkHandler(messageId)
    }
    if (scope) {
      onScopeDispose(unregister)
    }

    return ResultAsync.fromPromise(
      new Promise<void>((resolve, reject) => {
        const timeoutId = createTimeout(() => {
          logger.error(`Acknowledgment timeout for message ${messageId}`)
          unregister()
          reject(new NetworkError('Server timeout'))
        }, sendTimeoutMs)

        chatSocket.emit('sendMessage', { messageId, provider, modelId, prompt }, (response) => {
          cancelTimeout(timeoutId)

          if (response.success) {
            resolve()
          } else {
            unregister()

            const errorMessage = response.error ?? 'Unknown error'

            if (errorMessage.includes('Rate limit')) {
              reject(new RateLimitError(errorMessage))
            } else {
              reject(new ChatError(errorMessage))
            }
          }
        })
      }),
      (unknownError) => {
        unregister()

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
    prompt: string,
    onChunk: (chunk: string) => void
  ): Promise<Result<void, NetworkError | ChatError | RateLimitError>> => {
    const maxRetries = 5
    const initialDelayMs = 1000
    const backoffMultiplier = 2
    const maxDelayMs = 16000

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const result = await _sendMessageOnce(messageId, provider, modelId, prompt, onChunk)

      if (result.isOk()) {
        return result
      }

      // Fail fast on non-rate-limit errors
      if (!(result.error instanceof RateLimitError)) {
        return result
      }

      // Last attempt - return the error
      const isLastAttempt = attempt === maxRetries - 1
      if (isLastAttempt) {
        return result
      }

      // Calculate exponential backoff with jitter
      const exponentialDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt)
      const jitter = Math.random() * 0.3 * exponentialDelay
      const delayMs = Math.min(exponentialDelay + jitter, maxDelayMs)

      logger.warn(
        `Rate limit hit for message ${messageId}. Retrying in ${Math.round(delayMs)}ms (attempt ${attempt + 1}/${maxRetries})`
      )

      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }

    // This should never be reached, but TypeScript needs it
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

    unregisterChunkHandler(messageId)

    return ResultAsync.fromPromise(
      new Promise<void>((resolve, reject) => {
        const timeoutId = createTimeout(() => {
          reject(new NetworkError('Abort timeout'))
        }, abortTimeoutMs)

        chatSocket.emit('abortMessage', { messageId, deleteMessage: true }, (response) => {
          cancelTimeout(timeoutId)

          if (response.success) {
            resolve()
          } else {
            reject(new ChatError(response.error ?? 'Abort failed'))
          }
        })
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

  return {
    isStreaming,
    error,
    streamingMessageIds,
    sendMessage,
    abortMessage,
    isConnected: chatSocket.isConnected,
  }
}
