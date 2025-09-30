<template>
  <section
    id="history"
    class="flex flex-col w-full py-4 pr-4 pl-3 bg-slate"
  >
    <div class="flex flex-row w-full items-center justify-center gap-2">
      <i class="i-weui:search-outlined text-3xl text-subtleText" />
      <InputItem
        v-model:value="searchQuery"
        placeholder="Search for a message"
        @input="handleSearch"
      />
    </div>

    <!-- Loading State -->
    <div
      v-if="isLoading"
      class="flex justify-center p-8"
    >
      <div class="flex items-center gap-2 text-subtleText">
        <div class="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <span>Loading conversations...</span>
      </div>
    </div>

    <!-- Conversation List -->
    <div
      v-else
      class="flex flex-col gap-2 mt-4"
    >
      <h3 class="text-lg font-medium mb-2 text-deepText">
        Conversations
      </h3>

      <!-- Conversation Items -->
      <div
        v-for="conversation in filteredConversations"
        :key="conversation.id"
        class="flex items-center justify-between p-3 border border-borderMuted rounded-md hover:bg-panel cursor-pointer transition-colors"
        :class="{ 'bg-accent/10 border-accent': conversation.id === currentConversationId }"
        @click="switchToConversation(conversation.id!)"
      >
        <div class="flex-1">
          <div class="font-medium text-deepText">
            {{ conversation.title }}
          </div>
          <div class="text-sm text-subtleText">
            {{ conversation.messageCount || 0 }} messages • {{ formatDate(conversation.updatedAt) }}
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            @click.stop="handleRenameConversation(conversation)"
            class="text-subtleText hover:text-accent p-1 transition-colors"
            title="Rename conversation"
          >
            <i class="i-weui:pencil-outlined" />
          </button>
          <button
            @click.stop="handleDeleteConversation(conversation.id!)"
            class="text-subtleText hover:text-error p-1 transition-colors"
            title="Delete conversation"
          >
            <i class="i-weui:delete-outlined" />
          </button>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-if="filteredConversations.length === 0 && !isLoading"
        class="flex flex-col items-center justify-center p-8 text-subtleText"
      >
        <i class="i-bi:chat-left text-4xl mb-2 opacity-50" />
        <p class="text-center">
          {{ searchQuery ? 'No conversations found' : 'No conversations yet' }}
        </p>
        <p class="text-xs mt-2 text-center">
          Use the "New Chat" button above to start a conversation
        </p>
      </div>
    </div>

    <!-- Error Display -->
    <div
      v-if="error"
      class="bg-panel border border-error rounded-md p-3 mt-4"
    >
      <div class="flex items-center gap-2 text-error">
        <i class="i-weui:error-outlined" />
        <span class="text-sm">{{ error }}</span>
      </div>
    </div>

    <!-- Selected Conversation Messages using ConversationItem -->
    <div
      v-if="showSelectedMessages"
      class="mt-6"
    >
      <h4 class="text-md font-medium mb-2 text-deepText">
        Messages in "{{ currentConversationTitle }}"
      </h4>
      <div class="flex flex-col gap-2 max-h-96 overflow-y-auto border border-borderMuted rounded-md p-2 bg-panel">
        <div
          v-if="messagesLoading"
          class="flex justify-center p-4"
        >
          <div class="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
        <!-- Use ConversationItem for history display -->
        <ConversationItem
          v-for="message in selectedConversationMessages"
          :key="message.id"
          v-bind="message"
          status="sent"
          @delete="handleDeleteMessage"
          @update="handleUpdateMessage"
          @auto-save="handleAutoSave"
        />
        <div
          v-if="selectedConversationMessages.length === 0 && !messagesLoading"
          class="text-center text-subtleText p-4"
        >
          No messages in this conversation
        </div>
      </div>
    </div>

    <!-- Rename Dialog -->
    <div
      v-if="renameDialog.show"
      class="fixed inset-0 bg-slate/80 flex items-center justify-center z-50"
      @click.self="cancelRename"
    >
      <div class="bg-panel border border-borderMuted rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="text-lg font-medium mb-4 text-deepText">
          Rename Conversation
        </h3>
        <InputItem
          v-model:value="renameDialog.title"
          placeholder="Enter new title"
          class="mb-4"
          @keydown.enter.prevent="confirmRename"
          @keydown.escape.prevent="cancelRename"
        />
        <div class="flex justify-end gap-2">
          <button
            @click="cancelRename"
            class="px-4 py-2 text-subtleText hover:text-deepText transition-colors"
          >
            Cancel
          </button>
          <button
            @click="confirmRename"
            class="px-4 py-2 bg-accent text-slate rounded-md hover:bg-accentHover transition-colors"
            :disabled="!renameDialog.title.trim()"
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, inject } from "vue";
import InputItem from "../components/InputItem.vue";
import ConversationItem from "../components/ConversationItem.vue";
import type { Conversation } from "@babadeluxe/shared";
import { useConversation } from '@/composables/use-conversation';

const {
  messages,
  conversations,
  currentConversationId,
  isLoading,
  error,
  loadMessages,
  loadConversations,
  deleteConversation,
  switchConversation,
  deleteMessage,
  addOrUpdateMessage,
  updateConversationTitle,
  debouncedAutoSave
} = useConversation();

const searchQuery = ref("");
const messagesLoading = ref(false);
const renameDialog = ref({
  show: false,
  conversation: null as Conversation | null,
  title: ''
});

onMounted(async () => {
  try {
    await loadConversations();
  } catch (error) {
    console.error('Failed to load conversations:', error);
  }
});

const filteredConversations = computed(() => {
  if (!searchQuery.value.trim()) {
    return conversations.value;
  }

  return conversations.value.filter((conv: { title: string; }) =>
    conv.title.toLowerCase().includes(searchQuery.value.toLowerCase())
  );
});

const selectedConversationMessages = computed(() => {
  return messages.value;
});

const currentConversationTitle = computed(() => {
  const conversation = conversations.value.find(c => c.id === currentConversationId.value);
  return conversation?.title || 'Unknown Conversation';
});

const showSelectedMessages = computed(() => {
  return currentConversationId.value > 0 && selectedConversationMessages.value.length > 0;
});

const handleSearch = () => {
  // Search handled by computed filteredConversations
};

const switchToConversation = async (conversationId: number) => {
  try {
    messagesLoading.value = true;
    await switchConversation(conversationId);
  } catch (error) {
    console.error('Failed to switch conversation:', error);
  } finally {
    messagesLoading.value = false;
  }
};

const handleDeleteConversation = async (conversationId: number) => {
  if (!confirm('Are you sure you want to delete this conversation? This cannot be undone.')) {
    return;
  }

  try {
    const success = await deleteConversation(conversationId);
    if (!success) {
      console.error("Failed to delete conversation");
    }
  } catch (error) {
    console.error('Error deleting conversation:', error);
  }
};

const handleRenameConversation = (conversation: Conversation) => {
  renameDialog.value = {
    show: true,
    conversation,
    title: conversation.title
  };
};

const confirmRename = async () => {
  if (!renameDialog.value.conversation || !renameDialog.value.title.trim()) {
    return;
  }

  try {
    const success = await updateConversationTitle(
      renameDialog.value.conversation.id!,
      renameDialog.value.title.trim()
    );
    if (!success) {
      console.error("Failed to rename conversation");
    }
  } catch (error) {
    console.error('Error renaming conversation:', error);
  } finally {
    cancelRename();
  }
};

const cancelRename = () => {
  renameDialog.value = {
    show: false,
    conversation: null,
    title: ''
  };
};

const handleDeleteMessage = async (messageId: number) => {
  if (!confirm('Are you sure you want to delete this message?')) {
    return;
  }

  try {
    const success = await deleteMessage(messageId);
    if (!success) {
      console.error("Failed to delete message");
    }
  } catch (error) {
    console.error('Error deleting message:', error);
  }
};

const handleUpdateMessage = async (messageId: number, content: string) => {
  try {
    const success = await addOrUpdateMessage(content, 'user', messageId);
    if (!success) {
      console.error("Failed to update message");
    }
  } catch (error) {
    console.error('Error updating message:', error);
  }
};

const handleAutoSave = (messageId: number, content: string) => {
  debouncedAutoSave(messageId, content);
};

const formatDate = (date: Date | undefined) => {
  if (!date) return 'Unknown';

  try {
    return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
      Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      'day'
    );
  } catch (error) {
    return date.toLocaleDateString();
  }
};
</script>
