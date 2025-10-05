<template>
<section id="chat" class="flex flex-col w-full p-4 bg-slate">
  <div class="flex flex-col gap-0 pt-4 w-full justify-content items-center">
    <AvatarItem />
    <div class="inline-flex h-full items-center justify-center text-xl text-deepText">
      {{ currentUsername }}
    </div>
  </div>

  <!-- Error Display -->
  <div v-if="error" class="bg-panel border border-error rounded-md p-3 mb-4">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2 text-error">
        <i class="i-ant-design:info-circle-outlined" />
        <span class="text-sm">{{ error }}</span>
      </div>
      <button @click="clearError" class="text-error hover:text-error/80 transition-colors">
        <i class="i-weui:close-outlined" />
      </button>
    </div>
  </div>

  <div class="flex flex-col gap-0 pt-4">
    <div class="flex flex-col">
      <InputItem v-model:value="currentMessage" placeholder="How can I help you today?" :disabled="isLoading"
        @keydown.enter.exact.prevent="handleSendMessage" />
    </div>

    <div class="flex flex-col sm:flex-row border border-borderMuted rounded bg-panel">
      <div class="flex flex-col sm:flex-row items-center justify-between gap-3 w-full">
        <div class="flex flex-row w-auto">
          <!-- Prompt Selector -->
          <div class="flex items-center gap-2 px-3 py-2 cursor-pointer hover:text-accent transition-colors">
            <i class="i-bi:chat-left text-base text-subtleText" />
            <span class="text-sm text-deepText">{{ currentPrompt }}</span>
            <i class="i-weui:arrow-outlined rotate-90 text-base transform text-subtleText" />
          </div>

          <!-- AI Model Dropdown -->
          <div class="flex items-center gap-2 px-3 py-2 cursor-pointer hover:text-accent transition-colors">
            <i class="i-simple-icons:openai text-base text-subtleText" />
            <span class="text-sm text-deepText">{{ currentModel }}</span>
            <i class="i-weui:arrow-outlined rotate-90 text-base transform text-subtleText" />
          </div>
        </div>

        <div class="flex w-auto justify-center px-3 py-2 items-center hover:text-accent transition-colors"
          :class="{ 'opacity-50 cursor-not-allowed': isLoading || !currentMessage.trim() }" @click="handleSendMessage">
          <i v-if="!isLoading" class="i-bi:play-circle text-xl text-accent" />
          <div v-else class="w-5 h-5">
            <DotLottieVue style="height: 20px; width: 20px" autoplay loop
              src="https://lottie.host/61eb14b2-5dd2-471a-88c3-9e9c61862e83/Rldo3dbFyi.lottie" />
          </div>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading && messages.length === 0" class="flex justify-center p-8">
      <div class="flex items-center gap-2 text-subtleText">
        <div class="w-8 h-8">
          <DotLottieVue style="height: 32px; width: 32px" autoplay loop
            src="https://lottie.host/61eb14b2-5dd2-471a-88c3-9e9c61862e83/Rldo3dbFyi.lottie" />
        </div>
        <span>Loading conversation...</span>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="messages.length === 0" class="flex flex-col items-center justify-center p-8 text-subtleText">
      <i class="i-bi:chat-left-dots text-6xl mb-4 opacity-50" />
      <h3 class="text-lg font-medium mb-2 text-deepText">Start a conversation</h3>
      <p class="text-sm">Ask me anything to begin!</p>
    </div>

    <!-- Messages using ActiveChatItem -->
    <div class="flex flex-col gap-0">
      <ActiveChatItem v-for="message in messages" :key="message.id" v-bind="message" @delete="handleDeleteMessage"
        @update="handleUpdateMessage" @rewrite="handleRewriteMessage" />
    </div>
  </div>
</section>
</template>

<script setup lang="ts">
import { DotLottieVue } from '@lottiefiles/dotlottie-vue'
import { inject, onMounted, ref, computed } from 'vue'
import AvatarItem from '../components/AvatarItem.vue'
import ActiveChatItem from '../components/ActiveChatItem.vue'
import InputItem from '../components/InputItem.vue'
import { IocEnum } from '@/enums/ioc-enum'
import type { SocketService } from '@/socket-service'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useConversation } from '@/composables/use-conversation'
const {
  messages,
  conversations,
  currentConversationId,
  isLoading,
  error,
  loadMessages,
  loadConversations,
  initializeCurrentConversation,
  addOrUpdateMessage,
  deleteMessage,
  generateConversationTitle,
  updateConversationTitle,
} = useConversation()

const currentModel = ref('GPT-4')
const currentPrompt = ref('BabaSeniorDev™')
const currentMessage = ref('')

const socketService: SocketService = inject(IocEnum.SOCKET_SERVICE)!
const supabase: SupabaseClient<any, 'public', 'public', any, any> = inject(IocEnum.SUPABASE_CLIENT)!

const currentConversationTitle = computed(() => {
  const conversation = conversations.value.find((c) => c.id === currentConversationId.value)
  return conversation?.title || 'New Conversation'
})

const currentUser = await supabase.auth.getUser()
const currentUserId: string = currentUser.data.user?.id ?? ''

const currentUsername = ref('')

// Fetch username function
async function fetchUsername() {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // Try 1: GitHub provider username from user identities
    const githubIdentity = user?.identities?.find((id) => id.provider === 'github')
    if (githubIdentity && githubIdentity.identity_data?.login) {
      currentUsername.value = githubIdentity.identity_data.login
      return
    }

    // Try 2: Username from user metadata (profile)
    if (user?.user_metadata?.username) {
      currentUsername.value = user.user_metadata.username
      return
    }

    // Try 3: Username from user_setting table
    // const { data: settings, error: settingsError } = await supabase
    //   .from('user_setting')
    //   .select('settingValue')
    //   .eq('fkUserId', user?.id)
    //   .eq('settingKey', 'username')
    //   .limit(1)
    //   .single()

    // if (settingsError || !settings) {
    //   console.error('Failed to fetch username from user_setting:', settingsError)
    //   currentUsername.value = 'Unknown'
    //   return
    // }

    // currentUsername.value = settings.settingValue || 'Unknown'
  } catch (error) {
    console.error('Error fetching username:', error)
    currentUsername.value = 'Unknown'
  }
}

onMounted(async () => {
  try {
    await loadConversations()
    await initializeCurrentConversation()
    await fetchUsername() // Fetch username on mount
  } catch (error) {
    console.error('Failed to initialize chat:', error)
  }
})

const clearError = () => {
  // Error will clear on next successful operation
}

const handleDeleteMessage = async (messageId: number) => {
  const success = await deleteMessage(messageId)
  if (!success) {
    console.error('Failed to delete message')
  }
}

const handleUpdateMessage = async (messageId: number, content: string) => {
  const success = await addOrUpdateMessage(content, 'user', messageId)
  if (!success) {
    console.error('Failed to update message')
  }
}

const handleRewriteMessage = async (messageId: number, modelId: string) => {
  // TODO: Implement message rewrite with different model
  console.log('Rewrite message', messageId, 'with model', modelId)
}

const handleSendMessage = async () => {
  if (!currentMessage.value.trim() || isLoading.value) return

  const messageContent = currentMessage.value
  currentMessage.value = ''

  const userMessage = await addOrUpdateMessage(messageContent, 'user')
  if (!userMessage) {
    currentMessage.value = messageContent
    return
  }

  // Auto-generate title from first message
  if (messages.value.length === 1) {
    const newTitle = generateConversationTitle(messageContent)
    await updateConversationTitle(currentConversationId.value, newTitle)
  }

  console.log('Sending message to AI:', messageContent)
  // TODO: Socket.io integration here
}
</script>
