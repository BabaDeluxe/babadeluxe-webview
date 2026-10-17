import type { Ref } from 'vue'
import { ok, err, type Result } from 'neverthrow'
import type { Message, ContextReference } from '@/database/types'
import type { AppDb } from '@/database/app-db'
import {
  MessageNotFoundError,
  MessageUpdateError,
  MessageCreationError,
  type CreateOrResetAssistantError,
} from '@/errors'
import { encodeContextReferences } from '@/database/serializers'

export type MessageMetadata = {
  model?: string
  systemPrompt?: string
}

export function useAssistantMessageCreator(appDb: AppDb, messages: Ref<Message[]>) {
  async function resetExistingAssistantStreamingMessage(
    assistantMessageId: number,
    metadata: MessageMetadata | undefined,
    contextReferences: ContextReference[] | undefined
  ): Promise<Result<Message, MessageNotFoundError | MessageUpdateError>> {
    const updateResult = await appDb.message.update(assistantMessageId, {
      content: '',
      isStreaming: true,
      model: metadata?.model,
      systemPrompt: metadata?.systemPrompt,
      contextReferences: encodeContextReferences(contextReferences),
    })

    if (updateResult.isErr()) {
      return err(new MessageUpdateError(assistantMessageId, updateResult.error))
    }

    const messageIndex = messages.value.findIndex((message) => message.id === assistantMessageId)
    if (messageIndex === -1) {
      return err(new MessageNotFoundError(assistantMessageId.toString()))
    }

    const oldMessage = messages.value[messageIndex]
    const updated: Message = {
      ...oldMessage,
      content: '',
      isStreaming: true,
      model: metadata?.model ?? oldMessage.model,
      systemPrompt: metadata?.systemPrompt ?? oldMessage.systemPrompt,
      contextReferences,
      timestamp: oldMessage.timestamp,
    }

    messages.value.splice(messageIndex, 1, updated)
    return ok(updated)
  }

  async function createNewAssistantStreamingMessage(
    conversationId: number,
    metadata: MessageMetadata | undefined,
    contextReferences: ContextReference[] | undefined
  ): Promise<Result<Message, MessageCreationError>> {
    const createResult = await appDb.chatRepository.createMessage({
      conversationId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      model: metadata?.model,
      systemPrompt: metadata?.systemPrompt,
      contextReferences,
    })

    if (createResult.isErr()) {
      return err(new MessageCreationError('assistant', createResult.error))
    }

    const newMessage: Message = {
      id: createResult.value,
      conversationId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
      model: metadata?.model,
      systemPrompt: metadata?.systemPrompt,
      contextReferences,
    }

    messages.value.push(newMessage)
    return ok(newMessage)
  }

  async function createOrResetAssistantStreamingMessage(
    conversationId: number,
    existingAssistantId: number | undefined,
    metadata: MessageMetadata | undefined,
    contextReferences: ContextReference[] | undefined
  ): Promise<Result<Message, CreateOrResetAssistantError>> {
    if (existingAssistantId !== undefined) {
      return resetExistingAssistantStreamingMessage(
        existingAssistantId,
        metadata,
        contextReferences
      )
    }

    return createNewAssistantStreamingMessage(conversationId, metadata, contextReferences)
  }

  return {
    resetExistingAssistantStreamingMessage,
    createNewAssistantStreamingMessage,
    createOrResetAssistantStreamingMessage,
  }
}
