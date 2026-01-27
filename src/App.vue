<template>
  <div
    class="h-100vh max-h-100vh min-h-100vh max-w-100vw min-w-100vw bg-slate flex flex-col font-onest text-deepText"
  >
    <div v-if="session && $route.path !== '/'">
      <header
        class="flex items-center justify-between pr-2 bg-panel border-b border-borderMuted/20"
      >
        <IconBabaDeluxe />

        <div class="flex flex-row gap-4 justify-end items-center">
          <BaseButton
            text="New Chat"
            icon="i-weui:pencil-outlined"
            @click="handleNewChat"
          />

          <RouterLink
            to="/settings"
            class="rounded-lg hover:text-accent transition-colors"
          >
            <BaseButton
              :class="'bg-none text-deepText text-xl'"
              icon="i-weui:setting-outlined"
            />
          </RouterLink>
        </div>
      </header>

      <div class="flex justify-start items-center bg-panel">
        <nav class="flex flex-row gap-4 text-deepText p-2">
          <RouterLink
            v-slot="{ href, navigate, isExactActive }"
            to="/chat"
            custom
          >
            <a
              :href="href"
              class="px-2 py-1 rounded-lg transition-colors"
              :class="isExactActive ? 'text-accent bg-codeBg' : 'hover:text-accent hover:bg-codeBg'"
              @click="navigate"
            >
              Chat
            </a>
          </RouterLink>

          <RouterLink
            v-slot="{ href, navigate, isExactActive }"
            to="/history"
            custom
          >
            <a
              :href="href"
              class="px-2 py-1 rounded-lg transition-colors"
              :class="isExactActive ? 'text-accent bg-codeBg' : 'hover:text-accent hover:bg-codeBg'"
              @click="navigate"
            >
              History
            </a>
          </RouterLink>

          <RouterLink
            v-slot="{ href, navigate, isExactActive }"
            to="/prompts"
            custom
          >
            <a
              :href="href"
              class="px-2 py-1 rounded-lg transition-colors"
              :class="isExactActive ? 'text-accent bg-codeBg' : 'hover:text-accent hover:bg-codeBg'"
              @click="navigate"
            >
              Prompts
            </a>
          </RouterLink>
        </nav>
      </div>
    </div>

    <Suspense>
      <template #default>
        <RouterView class="flex flex-col flex-1" />
      </template>

      <template #fallback>
        <div class="flex flex-1 items-center justify-center bg-slate">
          <BaseSpinner
            size="large"
            message="Loading..."
            text-class="text-deepText"
          />
        </div>
      </template>
    </Suspense>
  </div>
</template>

<script setup lang="ts">
import { RouterLink, RouterView, useRouter } from 'vue-router'
import { inject, onMounted, ref } from 'vue'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import type { ConsoleLogger } from '@simwai/utils'
import IconBabaDeluxe from '@/components/IconBabaDeluxe.vue'
import BaseSpinner from '@/components/BaseSpinner.vue'
import BaseButton from '@/components/BaseButton.vue'
import { type SupabaseClientType } from '@/main'
import { LOGGER_KEY, SUPABASE_CLIENT_KEY } from '@/injection-keys'

const logger: ConsoleLogger = inject(LOGGER_KEY)!
const supabase: SupabaseClientType = inject(SUPABASE_CLIENT_KEY)!

const session = ref()
const router = useRouter()

const redirectToChat = () => {
  if (session.value && router.currentRoute.value.path === '/') {
    router.push('/chat')
  }
}

onMounted(async () => {
  const handleAuthStateChange = (event: AuthChangeEvent, supabaseSession: Session | null) => {
    if (event === 'SIGNED_IN' && supabaseSession) {
      session.value = supabaseSession
      redirectToChat()
    } else if (event === 'SIGNED_OUT') {
      session.value = null
      router.push('/')
    } else if (event === 'USER_UPDATED' && supabaseSession) {
      session.value = supabaseSession
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
  await router.push({ path: '/chat', query: { newConversation: 'true' } })
}
</script>
