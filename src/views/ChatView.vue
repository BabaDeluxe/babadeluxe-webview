<template>
  <section
    id="chat"
    class="flex flex-col w-full p-4"
  >
    <div class="flex flex-row gap-4">
      <AvatarItem />
      <div class="text-xl">
        Wobby
      </div>
      <div
        v-if="!isOnline"
        class="ml-auto flex items-center gap-2 text-orange-600"
      >
        <i class="i-fluent:wifi-off text-sm" />
        <span class="text-sm">Offline</span>
      </div>
    </div>

    <!-- Error Display -->
    <div
      v-if="error"
      class="bg-red-50 border border-red-200 rounded-md p-3 mb-4"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 text-red-800">
          <i class="i-ant-design:info-circle-outlined" />
          <span class="text-sm">{{ error }}</span>
        </div>
        <button
          @click="clearError"
          class="text-red-600 hover:text-red-800"
        >
          <i class="i-weui:close-outlined" />
        </button>
      </div>
    </div>

    <div class="flex flex-col gap-0 pt-4">
      <div class="flex flex-col">
        <InputItem
          v-model:value="currentMessage"
          placeholder="How can I help you today?"
          :disabled="isLoading"
          @keydown.enter.exact.prevent="handleSendMessage"
        />
      </div>

      <div class="flex flex-col md:flex-row border border-gray-300 rounded">
        <div class="flex flex-row items-center justify-between gap-3 w-full">
          <div class="flex flex-row w-auto">
            <!-- Prompt Selector -->
            <div class="flex items-center gap-2 px-3 py-2 cursor-pointer hover:text-accent">
              <i class="i-bi:chat-left text-base" />
              <span class="text-sm">{{ currentPrompt }}</span>
              <i class="i-weui:arrow-outlined rotate-90 text-base transform" />
            </div>

            <!-- AI Model Dropdown -->
            <div class="flex items-center gap-2 px-3 py-2 cursor-pointer hover:text-accent">
              <i class="i-simple-icons:openai text-base" />
              <span class="text-sm">{{ currentModel }}</span>
              <i class="i-weui:arrow-outlined rotate-90 text-base transform" />
            </div>
          </div>

          <div
            class="flex w-auto justify-center px-3 py-2 items-center hover:text-accent"
            :class="{ 'opacity-50 cursor-not-allowed': isLoading || !currentMessage.trim() || !isOnline }"
            @click="handleSendMessage"
          >
            <i
              v-if="!isLoading"
              class="i-bi:play-circle text-xl"
            />
            <div
              v-else
              class="w-5 h-5"
            >
              <!-- TODO Put this into a loading spinner component -->
              <DotLottieVue
                style="height: 20px; width: 20px"
                autoplay
                loop
                src="https://lottie.host/61eb14b2-5dd2-471a-88c3-9e9c61862e83/Rldo3dbFyi.lottie"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div
        v-if="isLoading && messages.length === 0"
        class="flex justify-center p-8"
      >
        <div class="flex items-center gap-2 text-subtleText">
          <div class="w-8 h-8">
            <DotLottieVue
              style="height: 32px; width: 32px"
              autoplay
              loop
              src="https://lottie.host/61eb14b2-5dd2-471a-88c3-9e9c61862e83/Rldo3dbFyi.lottie"
            />
          </div>
          <span>Loading conversation...</span>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="messages.length === 0"
        class="flex flex-col items-center justify-center p-8 text-subtleText"
      >
        <i class="i-bi:chat-left-dots text-6xl mb-4 opacity-50" />
        <h3 class="text-lg font-medium mb-2">
          Start a conversation
        </h3>
        <p class="text-sm">
          Ask me anything to begin!
        </p>
      </div>

      <!-- Messages -->
      <div class="flex flex-col gap-0">
        <ConversationItem
          v-for="message in messages"
          :key="message.id"
          v-bind="message"
          @delete="handleDeleteMessage"
          @update="handleUpdateMessage"
          @auto-save="handleAutoSave"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { DotLottieVue } from '@lottiefiles/dotlottie-vue'
import { inject, onMounted, ref, computed } from "vue";
import AvatarItem from "../components/AvatarItem.vue";
import ConversationItem from "../components/ConversationItem.vue";
import InputItem from "../components/InputItem.vue";
import { useConversation } from "../composables/use-conversation";
import { IocEnum } from '@/enums/ioc-enum';
import type { SocketService } from '@/socket-service';
import type { SupabaseClient } from '@supabase/supabase-js';

const {
  messages,
  conversations,
  currentConversationId,
  isLoading,
  error,
  isOnline,
  loadMessages,
  loadConversations,
  addMessage,
  updateMessage,
  deleteMessage,
  debouncedAutoSave  // Get the debounced function from the composable
} = useConversation();

const currentModel = ref("GPT-4");
const currentPrompt = ref("BabaSeniorDev™")
const currentMessage = ref("");

const socketService: SocketService = inject(IocEnum.SOCKET_SERVICE)!
if (!socketService) throw new Error('Failed to inject the socket service into the chat view')

const supabase: SupabaseClient<any, "public", "public", any, any> = inject(IocEnum.SUPABASE_CLIENT)!
if (!supabase) throw new Error('Failed to inject the supabase client into the chat view')
const currentConversationTitle = computed(() => {
  const conversation = conversations.value.find(c => c.id === currentConversationId.value);
  return conversation?.title || 'New Conversation';
});

const currentUser = await supabase.auth.getUser()
const currentUserId: string = currentUser.data.user?.id ?? ''

onMounted(async () => {
  await Promise.all([
    loadMessages(),
    loadConversations()
  ]);
});

// Fix: Create a method to clear error instead of trying to mutate readonly
const clearError = async () => {
  // Instead of directly setting error.value, reload to clear the error
  await loadMessages();
};

const handleAutoSave = (messageId: number, content: string) => {
  debouncedAutoSave(messageId, content);
};

const handleDeleteMessage = async (messageId: number) => {
  const success = await deleteMessage(messageId);
  if (!success) {
    console.error("Failed to delete message");
  }
};

const handleUpdateMessage = async (messageId: number, content: string) => {
  const success = await updateMessage(messageId, content);
  if (!success) {
    console.error("Failed to update message");
  }
};

const handleSendMessage = async () => {
  if (!currentMessage.value.trim() || isLoading.value || !isOnline.value) return;

  const messageContent = currentMessage.value;
  currentMessage.value = '';

  const userMessage = await addMessage(messageContent, 'user');
  if (!userMessage) {
    currentMessage.value = messageContent;
    return;
  }

  console.log("Sending message to AI:", messageContent);
}
</script>
