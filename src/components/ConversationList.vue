<template>
  <div class="flex flex-col pb-4 gap-2">
    <h3 class="text-lg font-medium text-deepText">Conversations</h3>

    <ConversationListItem
      v-for="conversation in conversations"
      :key="conversation.id ?? -1"
      :conversation="conversation"
      :message-count="getMessageCount(conversation.id)"
      :is-selected="conversation.id === currentConversationId"
      :test-id-prefix="testIdPrefix"
      @click="emit('select', conversation)"
      @rename="emit('rename', conversation)"
      @delete="emit('delete', conversation)"
    />

    <BaseEmptyState
      v-if="conversations.length === 0"
      icon="i-bi:chat-left"
      :description="emptyDescription"
    />
  </div>
</template>

<script setup lang="ts">
import type { Conversation } from '@/database/types'
import ConversationListItem from './ConversationListItem.vue'
import BaseEmptyState from './BaseEmptyState.vue'

interface ConversationListProps {
  conversations: Conversation[]
  currentConversationId: number
  emptyDescription: string
  getMessageCount: (conversationId: number) => number
  testIdPrefix?: string
}

defineProps<ConversationListProps>()

const emit = defineEmits<{
  select: [conversation: Conversation]
  rename: [conversation: Conversation]
  delete: [conversation: Conversation]
}>()
</script>
