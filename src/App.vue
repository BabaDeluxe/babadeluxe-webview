<template>
  <div class="h-100vh w-full bg-slate flex flex-col font-onest text-deepText">
    <div v-if="$route.path !== '/'">
      <header
        class="flex items-center justify-between p-2 bg-panel border-b border-borderMuted/20"
      >
        <BabaDeluxeIcon />

        <div class="flex flex-row gap-4 justify-end items-center">
          <ButtonItem
            text="New Chat"
            icon="i-weui:pencil-outlined"
            @click="handleNewChat"
          />
          <Avatar style="h-10" />

          <RouterLink
            to="/Settings"
            class="px-4 py-2 rounded-lg hover:text-accent transition-colors"
          >
            <ButtonItem
              :style="'bg-none text-deepText text-2xl'"
              icon="i-weui:setting-outlined"
            />
          </RouterLink>
        </div>
      </header>

      <div class="flex flex-row gap-4 justify-start items-center bg-panel">
        <nav class="flex space-x-2 text-deepText p-2">
          <RouterLink
            to="/Chat"
            class="px-4 py-2 rounded-lg hover:text-accent hover:bg-codeBg transition-colors"
          >
            Chat
          </RouterLink>
          <RouterLink
            to="/History"
            class="px-4 py-2 rounded-lg hover:text-accent hover:bg-codeBg transition-colors"
          >
            History
          </RouterLink>
          <RouterLink
            to="/Prompts"
            class="px-4 py-2 rounded-lg hover:text-accent hover:bg-codeBg transition-colors"
          >
            Prompts
          </RouterLink>
        </nav>
      </div>
    </div>
    <Suspense>
      <template #default>
        <RouterView class="flex-1 flex flex-col" />
      </template>
      <template #fallback>
        <div class="flex-1 flex flex-col items-center justify-center bg-slate text-lg text-deepText">
          Loading...
        </div>
      </template>
    </Suspense>
  </div>
</template>

<script setup lang="ts">
import { RouterLink, RouterView, useRouter } from "vue-router";
import { useConversation } from "./composables/use-conversation";
import Avatar from "./components/AvatarItem.vue";
import BabaDeluxeIcon from "./components/BabaDeluxeIcon.vue";
import ButtonItem from "./components/ButtonItem.vue";

const { createConversation } = useConversation()

const router = useRouter();

const handleNewChat = async () => {
  await createConversation('New Conversation');
  // Navigate using Vue Router
  if (router.currentRoute.value.path !== '/Chat') {
    router.push('/Chat');
  }
};
</script>
