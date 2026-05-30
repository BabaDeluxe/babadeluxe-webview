import { ref } from 'vue'
import { ok, err, type Result } from 'neverthrow'
import type { Conversation } from '@/database/types'
import type { AppDb } from '@/database/app-db'
import type { DbError } from '@/errors'
import { ChatError } from '@/errors'

export function useConversationListState(appDb: AppDb) {
  const conversations = ref<Conversation[]>([])
  const isLoadingConversations = ref(false)
  const messageCountsByConversation = ref<Map<number, number>>(new Map())

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
        } as Conversation)

        if (addResult.isErr()) return err(addResult.error)

        const newId = Number(addResult.value)
        const loadResult = await loadConversations()

        if (loadResult.isErr()) {
          await appDb.conversation.delete(newId)
          return err(new ChatError('Failed to load after creation', loadResult.error))
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

  return {
    conversations,
    isLoadingConversations,
    messageCountsByConversation,
    loadConversations,
    loadMessageCounts,
    getMessageCount,
    createConversation,
  }
}
