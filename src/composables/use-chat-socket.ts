import { ref, onBeforeUnmount, inject, readonly } from 'vue'
import { type Result, err, ResultAsync } from 'neverthrow'
import type { ConsoleLogger } from '@simwai/utils'
import { LOGGER_KEY, SOCKET_MANAGER_KEY } from '@/injection-keys'
import type { Chat } from '@babadeluxe/shared'
import type { SocketManager } from '@/socket-manager'

export function useChatSocket() {
  const socketManager: SocketManager = inject(SOCKET_MANAGER_KEY)!
  const logger: ConsoleLogger = inject(LOGGER_KEY)!

  if (!socketManager) {
    throw new Error('SocketManager not initialized')
  }

  const chatSocket = socketManager.chatSocket

  const isStreaming = ref(false)
  const error = ref<string | undefined>()
  const currentStreamingMessageId = ref<number | null>(null)

  const activeChunkHandlers = new Map<number, (chunk: string) => void>()

  // Use Chat namespace types
  const onMessageChunk: Chat.Emission['messageChunk'] = ({ messageId, chunk }) => {
    console.log('🔵 RECEIVED CHUNK:', chunk.substring(0, 50), 'for message:', messageId) // ← ADD THIS
    const handler = activeChunkHandlers.get(messageId)
    if (handler) {
      handler(chunk)
    } else {
      logger.warn(`No handler for message ${messageId}`)
    }
  }

  const onMessageComplete: Chat.Emission['messageComplete'] = ({ messageId }) => {
    logger.log(`Message ${messageId} complete`)
    activeChunkHandlers.delete(messageId)

    if (currentStreamingMessageId.value === messageId) {
      isStreaming.value = false
      currentStreamingMessageId.value = null
    }
  }

  const onChatError: Chat.Emission['chatError'] = ({ messageId, error: errorMsg }) => {
    logger.error(`Chat error for message ${messageId}:`, errorMsg)
    error.value = errorMsg
    if (messageId) activeChunkHandlers.delete(messageId)

    if (currentStreamingMessageId.value === messageId) {
      isStreaming.value = false
      currentStreamingMessageId.value = null
    }
  }

  const onMessageDeleted: Chat.Emission['messageDeleted'] = ({ messageId }) => {
    logger.log(`Message ${messageId} deleted`)
    activeChunkHandlers.delete(messageId)

    if (currentStreamingMessageId.value === messageId) {
      isStreaming.value = false
      currentStreamingMessageId.value = null
    }
  }

  const initListeners = async () => {
    const waitResult = await chatSocket.waitForConnection()
    if (waitResult.isOk()) {
      console.log('🔵 Registering listeners on socket:', chatSocket.socketId) // ← Add

      chatSocket.on('messageChunk', onMessageChunk)
      chatSocket.on('messageComplete', onMessageComplete)
      chatSocket.on('chatError', onChatError)
      chatSocket.on('messageDeleted', onMessageDeleted)
      console.log('🔵 Chat socket listeners registered')
    } else {
      logger.error('Failed to wait for socket connection:', waitResult.error)
    }
  }

  // Initialize listeners immediately
  void initListeners()

  // Cleanup
  onBeforeUnmount(() => {
    chatSocket.off('messageChunk', onMessageChunk)
    chatSocket.off('messageComplete', onMessageComplete)
    chatSocket.off('chatError', onChatError)
    chatSocket.off('messageDeleted', onMessageDeleted)
    activeChunkHandlers.clear()
  })

  const sendMessage = async (
    messageId: number,
    provider: string,
    modelId: string,
    prompt: string,
    onChunk: (chunk: string) => void
  ): Promise<Result<void, Error>> => {
    const waitResult = await chatSocket.waitForConnection()
    if (waitResult.isErr()) {
      return err(waitResult.error)
    }

    activeChunkHandlers.set(messageId, onChunk)
    isStreaming.value = true
    currentStreamingMessageId.value = messageId
    error.value = undefined

    return ResultAsync.fromPromise(
      new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          logger.error('Acknowledgment timeout')
          activeChunkHandlers.delete(messageId)
          reject(new Error('Server timeout'))
        }, 60000)

        chatSocket.emit('sendMessage', { messageId, provider, modelId, prompt }, (response) => {
          clearTimeout(timeoutId)

          if (response.success) {
            resolve()
          } else {
            activeChunkHandlers.delete(messageId)
            error.value = response.error
            reject(new Error(response.error ?? 'Unknown error'))
          }
        })
      }),
      (unknownError) => {
        activeChunkHandlers.delete(messageId)
        return unknownError instanceof Error ? unknownError : new Error('Failed to send message')
      }
    )
  }

  const abortMessage = async (messageId: number): Promise<Result<void, Error>> => {
    const waitResult = await chatSocket.waitForConnection()
    if (waitResult.isErr()) {
      return err(waitResult.error)
    }

    activeChunkHandlers.delete(messageId)

    return ResultAsync.fromPromise(
      new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Abort timeout'))
        }, 5000)

        chatSocket.emit('abortMessage', { messageId, deleteMessage: true }, (response) => {
          clearTimeout(timeoutId)

          if (response.success) {
            // Reset streaming state immediately on successful abort
            if (currentStreamingMessageId.value === messageId) {
              isStreaming.value = false
              currentStreamingMessageId.value = null
            }
            resolve()
          } else {
            error.value = response.error
            reject(new Error(response.error ?? 'Abort failed'))
          }
        })
      }),
      (unknownError) => (unknownError instanceof Error ? unknownError : new Error('Abort failed'))
    )
  }

  return {
    isStreaming: readonly(isStreaming),
    error: readonly(error),
    currentStreamingMessageId: readonly(currentStreamingMessageId),
    sendMessage,
    abortMessage,
    isConnected: chatSocket.isConnected,
  }
}
