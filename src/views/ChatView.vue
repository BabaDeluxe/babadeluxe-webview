<template>
  <section id="chat" class="flex flex-col w-full w-full p-4">
    <div class="flex flex-row gap-4">
      <AvatarItem></AvatarItem>
      <div class="text-xl">Wobby</div>
    </div>
    <div class="flex flex-col gap-0 pt-4">
      <div class="flex flex-col">
        <InputItem
          placeholder="How can I help you today?"
          @update:value="handleUpdateMessage"
        ></InputItem>
      </div>
      <div class="flex flex-col md:flex-row border border-gray-300 rounded">
        <div class="flex flex-row items-center justify-between gap-3 w-full">
          <div class="flex flex-row w-auto">
            <!-- Prompts Dropdown -->
            <div
              class="flex items-center gap-2 px-3 py-2 cursor-pointer hover:text-accent"
            >
              <i class="i-weui:note-outlined text-base"></i>
              <span class="text-sm">Prompts</span>
              <i
                class="i-weui:arrow-outlined rotate-90 text-base transform"
              ></i>
            </div>

            <!-- AI Model Dropdown -->
            <div
              class="flex items-center gap-2 px-3 py-2 cursor-pointer hover:text-accent"
            >
              <i class="i-simple-icons:openai text-base"></i>
              <span class="text-sm">{{ selectedModel }}</span>
              <i
                class="i-weui:arrow-outlined rotate-90 text-base transform"
              ></i>
            </div>
          </div>

          <div
            class="flex w-auto justify-center px-3 py-2 items-center hover:text-accent"
            @click="handleSendMessage"
          >
            <i class="i-bi:play-circle text-xl"></i>
          </div>
        </div>
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
          :is-streaming="message.isStreaming"
          @delete="handleDeleteMessage"
          @update="handleUpdateMessage"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";

import AvatarItem from "../components/AvatarItem.vue";
import ConversationItem from "../components/ConversationItem.vue";
import InputItem from "../components/InputItem.vue";

import { db } from "../database/db";
import type { Message } from "@babadeluxe/shared";

const messages = ref<Message[]>([]);
const currentConversationId = ref(1);
const selectedModel = ref("GPT-4");

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
  const message = messages.value.find((message) => message.id === messageId);
  if (message) {
    message.content = content;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function handleSendMessage(value: Event) {
  throw new Error("Send message is not implemented yet.");
}
</script>

<style scoped>
/* Add component styles here */
</style>
