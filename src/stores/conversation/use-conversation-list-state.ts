import { ref } from 'vue'
import { ok, err, type Result, ResultAsync } from 'neverthrow'
import type { Conversation } from '@/database/types'
import type { AppDb } from '@/database/app-db'
import { DbError, ChatError } from '@/errors'

export function useConversationListState(appDb: AppDb) {
  const conversations = ref<Conversation[]>([])
  const isLoadingConversations = ref(false)
  const messageCountsByConversation = ref<Map<number, number>>(new Map())
  const error = ref<string | undefined>(undefined)

  let creationPromise: Promise<Result<number, DbError | ChatError>> | undefined

  async function loadConversations(): Promise<Result<void, DbError>> {
    isLoadingConversations.value = true
    const result = await appDb.conversation.toArray()

    if (result.isErr()) {
      isLoadingConversations.value = false
      return err(result.error)
    }

    conversations.value = [...result.value]
    isLoadingConversations.value = false
    return ok(undefined)
  }

  async function loadMessageCounts(): Promise<Result<void, DbError>> {
    const result = await appDb.chatRepository.getMessageCountsByConversation()

    if (result.isErr()) {
      messageCountsByConversation.value = new Map()
      return err(result.error)
    }

    messageCountsByConversation.value = result.value
    return ok(undefined)
  }

  function getMessageCount(conversationId: number): number {
    return messageCountsByConversation.value.get(conversationId) ?? 0
  }

  async function createConversation(title: string): Promise<Result<number, DbError | ChatError>> {
    if (creationPromise) return creationPromise

    creationPromise = (async () => {
      try {
        const addResult = await appDb.conversation.add({
          title,
          isActive: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        })

        if (addResult.isErr()) {
          error.value = 'Failed to create conversation'
          return err(addResult.error)
        }

        const newId = Number(addResult.value)
        const loadResult = await loadConversations()

        if (loadResult.isErr()) {
          await appDb.conversation.delete(newId)
          return err(new ChatError('Failed to load conversations after creation', loadResult.error))
        }

        if (!conversations.value.some((c) => c.id === newId)) {
          await appDb.conversation.delete(newId)
          return err(new ChatError('Created conversation missing from loaded list'))
        }

        return ok(newId)
      } finally {
        creationPromise = undefined
      }
    })()

    return creationPromise
  }

  async function updateConversationTitle(
    conversationId: number,
    title: string
  ): Promise<Result<void, DbError>> {
    const result = await ResultAsync.fromPromise(
      appDb.conversation.update(conversationId, {
        title,
        updatedAt: new Date(),
      }),
      (unknownError) => {
        if (unknownError instanceof Error) {
          return new DbError(unknownError.message, unknownError)
        }
        return new DbError('Failed to update conversation title', unknownError)
      }
    )

    if (result.isErr()) {
      error.value = 'Failed to update conversation title'
      return err(result.error)
    }

    const conversation = conversations.value.find((conv) => conv.id === conversationId)
    if (conversation) {
      conversation.title = title
      conversation.updatedAt = new Date()
    }

    error.value = undefined
    return ok(undefined)
  }

  async function deleteConversation(
    conversationId: number
  ): Promise<Result<void, DbError | ChatError>> {
    const result = await appDb.chatRepository.deleteConversationWithMessage(conversationId)

    if (result.isErr()) {
      error.value = 'Failed to delete conversation'
      return err(result.error)
    }

    const loadResult = await loadConversations()
    if (loadResult.isErr()) return err(loadResult.error)

    error.value = undefined
    return ok(undefined)
  }

  return {
    conversations,
    isLoadingConversations,
    messageCountsByConversation,
    error,
    loadConversations,
    loadMessageCounts,
    getMessageCount,
    createConversation,
    updateConversationTitle,
    deleteConversation,
  }
}
