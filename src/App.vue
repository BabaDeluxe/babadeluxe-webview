<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router";
</script>

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
          />
          <Avatar class="mr-2" />

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

      <div class="flex flex-row gap-4 justify-start items-center">
        <nav class="flex space-x-2 text-deepText">
          <RouterLink
            to="/Chat"
            class="px-4 py-2 rounded-lg hover:text-accent transition-colors"
          >
            Chat
          </RouterLink>
          <RouterLink
            to="/History"
            class="px-4 py-2 rounded-lg hover:text-accent transition-colors"
          >
            History
          </RouterLink>
          <RouterLink
            to="/Prompts"
            class="px-4 py-2 rounded-lg hover:text-accent transition-colors"
          >
            Prompts
          </RouterLink>
        </nav>
      </div>
    </div>
    <RouterView class="flex-1 flex flex-col" />


    <Suspense>
      <template #default>
        <RouterView class="flex-1 flex flex-col" />
      </template>
      <template #fallback>
        <div class="flex-1 flex flex-col items-center justify-center">
          <div class="text-lg">
            Loading...
          </div>
        </div>
      </template>
    </Suspense>
  </div>
</template>

<script lang="ts">
import "virtual:uno.css";
import Avatar from "./components/AvatarItem.vue";
import BabaDeluxeIcon from "./components/BabaDeluxeIcon.vue";
import ButtonItem from "./components/ButtonItem.vue";
</script>
