<template>
<div class="h-100vh w-full bg-slate flex flex-col font-onest text-deepText">
  <div v-if="session && $route.path !== '/'">
    <header class="flex items-center justify-between p-2 bg-panel border-b border-borderMuted/20">
      <BabaDeluxeIcon />

      <div class="flex flex-row gap-4 justify-end items-center">
        <ButtonItem text="New Chat" icon="i-weui:pencil-outlined" @click="handleNewChat" />

        <RouterLink to="/Settings" class="px-4 py-2 rounded-lg hover:text-accent transition-colors">
          <ButtonItem @click="" :style="'bg-none text-deepText text-2xl'" icon="i-weui:setting-outlined" />
        </RouterLink>
      </div>
    </header>

    <div class="flex flex-row gap-4 justify-start items-center bg-panel">
      <nav class="flex space-x-2 text-deepText p-2">
        <RouterLink to="/Chat" class="px-4 py-2 rounded-lg hover:text-accent hover:bg-codeBg transition-colors">
          Chat
        </RouterLink>
        <RouterLink to="/History" class="px-4 py-2 rounded-lg hover:text-accent hover:bg-codeBg transition-colors">
          History
        </RouterLink>
        <RouterLink to="/Prompts" class="px-4 py-2 rounded-lg hover:text-accent hover:bg-codeBg transition-colors">
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
import { RouterLink, RouterView, useRouter } from 'vue-router'
import { useConversation } from './composables/use-conversation'
import BabaDeluxeIcon from './components/BabaDeluxeIcon.vue'
import ButtonItem from './components/ButtonItem.vue'
import { inject, onMounted, ref } from 'vue'
import { ConsoleLogger } from '@simwai/utils'
import { IocEnum } from './enums/ioc-enum'
import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js'

const logger: ConsoleLogger = inject(IocEnum.LOGGER)!
const supabase: SupabaseClient = inject(IocEnum.SUPABASE_CLIENT)!

const { createConversation } = useConversation()

const session = ref()
const router = useRouter()

const redirectToChat = () => {
  if (session.value && router.currentRoute.value.path === '/') {
    router.push('/Chat')
  }
}

onMounted(async () => {
  const handleAuthStateChange = (event: AuthChangeEvent, supabaseSession: Session | null) => {
    if (event === 'SIGNED_IN' && supabaseSession) {
      session.value = supabaseSession
      redirectToChat()
    } else if (event === 'SIGNED_OUT') {
      router.push('/')
    } else if (event === 'PASSWORD_RECOVERY') {
      router.push('/reset-password')
    }
  }

  supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
    handleAuthStateChange(event, session)
  })

  const supabaseSession = await supabase.auth.getSession()
  const sessionData = supabaseSession.data.session
  if (!sessionData) {
    logger.warn('Invalid login session data received in App.vue')
    return
  }

  session.value = sessionData
  redirectToChat()
})

const handleNewChat = async () => {
  await createConversation('New Conversation')
  redirectToChat()
}
</script>
