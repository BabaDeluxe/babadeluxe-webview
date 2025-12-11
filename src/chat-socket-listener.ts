import { ref } from 'vue'
import type { ConsoleLogger } from '@simwai/utils'
import type { SocketManager } from '@/socket-manager'
import type { AppDb } from '@/database/app-db'

type ChatSocket = SocketManager

interface MessageState {
  handler: ((chunk: string) => void) | undefined
  isStreaming: boolean
  pendingWrites: Promise<void>[]
  error?: string
}

const messageStates = ref(new Map<number, MessageState>())
let isInitialized = false
let appDb: AppDb | undefined
let loggerInstance: ConsoleLogger | undefined

const cleanupMessage = async (messageId: number): Promise<void> => {
  const state = messageStates.value.get(messageId)
  if (!state) return

  await Promise.allSettled(state.pendingWrites)
  messageStates.value.delete(messageId)
}

export function initChatSocketListeners(
  chatSocket: ChatSocket,
  logger: ConsoleLogger,
  db: AppDb
): void {
  if (isInitialized) {
    logger.warn('Chat socket listeners already initialized')
    return
  }

  isInitialized = true
  appDb = db
  loggerInstance = logger

  chatSocket.on('chat:messageChunk', async ({ messageId, chunk }) => {
    const state = messageStates.value.get(messageId)
    if (!state) {
      loggerInstance?.warn(`Late chunk for message ${messageId} - writing directly to DB`)

      if (appDb) {
        const result = await appDb.appendChunkToDb(messageId, chunk)
        if (result.isErr()) {
          loggerInstance?.error(`Failed to append late chunk: ${result.error.message}`)
        }
      }

      return
    }

    if (appDb) {
      const writePromise = appDb.appendChunkToDb(messageId, chunk).then((result) => {
        if (result.isErr()) {
          loggerInstance?.error(
            `Failed to append chunk for message ${messageId}: ${result.error.message}`
          )
          state.error = result.error.message
        }
      })
      state.pendingWrites.push(writePromise)
    }

    if (state.handler) state.handler(chunk)
    else loggerInstance?.warn(`No handler for message ${messageId}`)
  })

  chatSocket.on('chat:messageComplete', async ({ messageId }) => {
    const state = messageStates.value.get(messageId)
    if (!state) {
      loggerInstance?.warn(`Complete event for unknown message ${messageId}`)
      return
    }

    state.isStreaming = false
    loggerInstance?.log(`Message ${messageId} complete`)
    await cleanupMessage(messageId)
  })

  chatSocket.on('chat:chatError', async ({ messageId, error: errorMessage }) => {
    const state = messageId !== undefined ? messageStates.value.get(messageId) : undefined

    if (messageId !== undefined && !state) {
      loggerInstance?.warn(`Error event for unknown message ${messageId}`)
      return
    }

    if (!(messageId !== undefined && state)) return

    state.isStreaming = false
    loggerInstance?.error(`Chat error for message ${messageId}: ${errorMessage}`)
    state.error = errorMessage
    await cleanupMessage(messageId)
  })

  chatSocket.on('chat:messageDeleted', async ({ messageId }) => {
    const state = messageStates.value.get(messageId)
    if (!state) {
      loggerInstance?.warn(`Delete event for unknown message ${messageId}`)
      return
    }

    state.isStreaming = false
    loggerInstance?.log(`Message ${messageId} deleted`)
    await cleanupMessage(messageId)
  })

  loggerInstance?.log('Chat socket listeners initialized')
}

export function registerChunkHandler(messageId: number, handler: (chunk: string) => void): void {
  const existing = messageStates.value.get(messageId)

  if (existing) {
    existing.handler = handler
    return
  }

  messageStates.value.set(messageId, {
    handler,
    isStreaming: true,
    pendingWrites: [],
  })
}

export function unregisterChunkHandler(messageId: number): void {
  void cleanupMessage(messageId)
}

export function getChatSocketState(messageId: number): {
  isStreaming: boolean
  error?: string
} {
  const state = messageStates.value.get(messageId)
  return {
    isStreaming: state?.isStreaming ?? false,
    error: state?.error,
  }
}

export function getAllStreamingMessageIds(): number[] {
  return Array.from(messageStates.value.entries())
    .filter(([, state]) => state.isStreaming)
    .map(([id]) => id)
}

export function resumeStreamingMessage(messageId: number, handler: (chunk: string) => void): void {
  const existing = messageStates.value.get(messageId)

  if (existing) {
    existing.handler = handler
    return
  }

  messageStates.value.set(messageId, {
    handler,
    isStreaming: true,
    pendingWrites: [],
  })
}

export function hasAnyStreamingMessage(): boolean {
  return Array.from(messageStates.value.values()).some((state) => state.isStreaming)
}
