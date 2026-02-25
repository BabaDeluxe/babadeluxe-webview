<template>
  <div class="flex flex-col gap-2">
    <h4 class="text-md font-medium text-deepText">Messages in "{{ conversationTitle }}"</h4>

    <ChatMessage
      v-for="message in messages"
      :key="message.id"
      :data-message-id="message.id"
      v-bind="message"
      :is-rewrite-enabled="props.isRewriteEnabled"
      @delete="emit('delete', $event)"
      @update="(id, content) => emit('update', id, content)"
    />

    <BaseEmptyState
      v-if="messages.length === 0"
      icon="i-bi:chat-text"
      description="No messages in this conversation"
    />
  </div>
</template>

<script setup lang="ts">
import type { Message } from '@/database/types'
import ChatMessage from '@/components/ChatMessage.vue'
import BaseEmptyState from '@/components/BaseEmptyState.vue'

interface MessageListProps {
  messages: Message[]
  conversationTitle: string
  isRewriteEnabled: boolean
}

const props = defineProps<MessageListProps>()

const emit = defineEmits<{
  delete: [messageId: number]
  update: [messageId: number, content: string]
}>()
</script>
