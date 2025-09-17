<template>
  <section id="history" class="flex flex-col w-full w-full py-4 pr-4 pl-3">
    <div class="flex flex-row w-full items-center justify-center gap-2">
      <i class="i-weui:search-outlined text-3xl"></i>
      <!-- TODO Bind the update event for search -->
      <InputItem placeholder="Search for a message"></InputItem>
    </div>
    <div class="flex flex-col gap-0">
      <ConversationItem
        v-for="message in messages"
        :key="message.id"
        :id="message.id!"
        :conversation-id="message.conversationId"
        :role="message.role"
        :content="message.content"
        :timestamp="message.timestamp"
        :is-streaming="false"
        @delete="handleDeleteMessage"
        @update="handleUpdateMessage"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";

import { db } from "../database/db";
import type { Message } from "@babadeluxe/shared";
import InputItem from "../components/InputItem.vue";
import ConversationItem from "../components/ConversationItem.vue";

const messages = ref<Message[]>([]);
const currentConversationId = ref(1);

onMounted(async () => {
  await loadMessages();
});

async function loadMessages() {
  try {
    messages.value = await db.getMessageByConversation(
      currentConversationId.value,
    );
  } catch (error) {
    console.trace("Failed to load messages:", error);
  }
}

function handleDeleteMessage(messageId: number) {
  const index = messages.value.findIndex((m) => m.id === messageId);
  if (index !== -1) {
    messages.value.splice(index, 1);
  }
}

function handleUpdateMessage(messageId: number, content: string) {
  const message = messages.value.find((m) => m.id === messageId);
  if (message) {
    message.content = content;
  }
}
</script>
