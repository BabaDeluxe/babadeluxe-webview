import type { Ref } from 'vue'
import type { Message } from '@/database/types'
import type { AppDb } from '@/database/app-db'
import type { Result } from 'neverthrow'
import type { AbstractLogger } from '@/logger'
import type { useChatSocket } from '@/composables/use-chat-socket'
import type { useTrackedTimeouts } from '@/composables/use-tracked-timeouts'

type ResumeStreamingMessageFn = ReturnType<typeof useChatSocket>['resumeStreamingMessage']
type CreateTimeoutFn = ReturnType<typeof useTrackedTimeouts>['createTimeout']

export function useStreamRecovery(
  appDb: AppDb,
  logger: AbstractLogger,
  messages: Ref<Message[]>,
  refreshMessageById: (messageId: number) => Promise<Result<unknown, unknown>>,
  resumeStreamingMessage: ResumeStreamingMessageFn,
  createTimeout: CreateTimeoutFn
) {
  async function markMessageStreamingComplete(messageId: number): Promise<void> {
    const updateResult = await appDb.message.update(messageId, { isStreaming: false })
    if (updateResult.isErr()) {
      logger.error('Failed to mark message streaming complete', {
        messageId,
        error: updateResult.error,
      })
      return
    }

    const refreshResult = await refreshMessageById(messageId)
    if (refreshResult.isErr()) {
      logger.error('Failed to refresh message after streaming complete', {
        messageId,
        error: refreshResult.error,
      })
    }
  }

  async function markAllStreamingCompleteInCurrentConversation(
    conversationId: number
  ): Promise<void> {
    if (!conversationId) return

    const streamingMessages = messages.value.filter(
      (message) => message.conversationId === conversationId && message.isStreaming
    )

    for (const message of streamingMessages) {
      const updateResult = await appDb.message.update(message.id, { isStreaming: false })
      if (updateResult.isErr()) {
        logger.error('Failed to mark message streaming complete when switching conversation', {
          messageId: message.id,
          error: updateResult.error,
        })
        continue
      }

      const index = messages.value.findIndex((m) => m.id === message.id)
      if (index === -1) continue

      const current = messages.value[index]
      current.isStreaming = false
    }
  }

  async function resumeInterruptedStreams(): Promise<void> {
    const streamingMessagesResult = await appDb.chatRepository.getStreamingMessages()

    if (streamingMessagesResult.isErr()) {
      logger.error('Failed to get streaming messages during recovery', {
        error: streamingMessagesResult.error,
      })
      return
    }

    const streamingMessages = streamingMessagesResult.value
    if (streamingMessages.length === 0) {
      logger.log('No interrupted streams to recover')
      return
    }

    logger.log(`Recovering ${streamingMessages.length} interrupted stream(s)`)

    for (const streamingMessage of streamingMessages) {
      let didReceiveChunk = false

      resumeStreamingMessage(streamingMessage.id, {
        onChunk: (chunk: string) => {
          didReceiveChunk = true

          const messageIndex = messages.value.findIndex(
            (message) => message.id === streamingMessage.id
          )
          if (messageIndex === -1) return

          const current = messages.value[messageIndex]
          const updated: Message = {
            ...current,
            content: current.content + chunk,
          }

          messages.value.splice(messageIndex, 1, updated)
        },
        onComplete: (fullContent: string) => {
          didReceiveChunk = true

          const messageIndex = messages.value.findIndex(
            (message) => message.id === streamingMessage.id
          )
          if (messageIndex === -1) return

          const current = messages.value[messageIndex]
          const updated: Message = {
            ...current,
            content: fullContent,
            isStreaming: false,
          }

          messages.value.splice(messageIndex, 1, updated)
          void markMessageStreamingComplete(streamingMessage.id)
        },
      })

      createTimeout(async () => {
        if (didReceiveChunk) return

        logger.log('Message appears complete, cleaning up', {
          messageId: streamingMessage.id,
        })

        await markMessageStreamingComplete(streamingMessage.id)
      }, 1000)
    }

    logger.log('Stream recovery complete')
  }

  return {
    markMessageStreamingComplete,
    markAllStreamingCompleteInCurrentConversation,
    resumeInterruptedStreams,
  }
}
