<template>
  <div
    class="h-100vh max-h-100vh min-h-100vh max-w-100vw min-w-100vw bg-slate flex flex-col font-onest text-deepText"
  >
    <div v-if="session && $route.path !== '/'">
      <header
        class="flex items-center justify-between p-2 bg-panel border-b border-borderMuted/20"
        data-testid="app-header"
      >
        <IconBabaDeluxe />

        <div class="flex flex-row gap-2 justify-end items-center">
          <BaseButton
            variant="primary"
            data-testid="nav-new-chat-button"
            text="New Chat"
            icon="i-weui:pencil-outlined"
            @click="handleNewChat"
          />

          <BaseButton
            variant="icon"
            class="bg-transparent text-subtleText hover:text-deepText hover:bg-borderMuted/20 text-xl w-9 h-9 p-0"
            icon="i-weui:setting-outlined"
            data-testid="nav-settings-button"
            @click="router.push('/settings')"
          />
        </div>
      </header>

      <div class="flex justify-start items-center bg-panel">
        <nav
          class="flex flex-row gap-2 text-deepText p-2"
          data-testid="app-nav"
        >
          <RouterLink
            v-slot="{ navigate, isExactActive }"
            to="/chat"
            custom
          >
            <BaseButton
              variant="ghost"
              class="px-3 py-1.5 rounded-lg transition-colors cursor-pointer select-none text-sm font-medium"
              :class="
                isExactActive
                  ? 'text-accent bg-codeBg'
                  : 'text-subtleText hover:text-accent hover:bg-codeBg'
              "
              data-testid="nav-chat-link"
              @click="navigate"
            >
              Chat
            </BaseButton>
          </RouterLink>

          <RouterLink
            v-slot="{ navigate, isExactActive }"
            to="/history"
            custom
          >
            <BaseButton
              variant="ghost"
              class="px-3 py-1.5 rounded-lg transition-colors cursor-pointer select-none text-sm font-medium"
              :class="
                isExactActive
                  ? 'text-accent bg-codeBg'
                  : 'text-subtleText hover:text-accent hover:bg-codeBg'
              "
              data-testid="nav-history-link"
              @click="navigate"
            >
              History
            </BaseButton>
          </RouterLink>

          <RouterLink
            v-slot="{ navigate, isExactActive }"
            to="/prompts"
            custom
          >
            <BaseButton
              variant="ghost"
              class="px-3 py-1.5 rounded-lg transition-colors cursor-pointer select-none text-sm font-medium"
              :class="
                isExactActive
                  ? 'text-accent bg-codeBg'
                  : 'text-subtleText hover:text-accent hover:bg-codeBg'
              "
              data-testid="nav-prompts-link"
              @click="navigate"
            >
              Prompts
            </BaseButton>
          </RouterLink>
        </nav>
      </div>
    </div>

    <Suspense>
      <template #default>
        <Suspense suspensible>
          <div class="flex-1 min-h-0 flex flex-col bg-slate overflow-hidden">
            <RouterView v-slot="{ Component }">
              <Transition
                name="view-transition"
                mode="out-in"
              >
                <KeepAlive :include="['ChatView', 'HistoryView', 'PromptsView']">
                  <component
                    :is="Component"
                    class="flex-1 min-h-0 flex flex-col"
                  />
                </KeepAlive>
              </Transition>
            </RouterView>
          </div>
        </Suspense>
      </template>
    </Suspense>
  </div>
</template>

<script setup lang="ts">
import { RouterLink, RouterView, useRouter } from 'vue-router'
import { onMounted, ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import type { AbstractLogger } from '@/logger'
import IconBabaDeluxe from '@/components/IconBabaDeluxe.vue'
import BaseButton from '@/components/BaseButton.vue'
import { type SupabaseClientType } from '@/main'
import { LOGGER_KEY, SUPABASE_CLIENT_KEY } from '@/injection-keys'
import { useConversationStore } from '@/stores/use-conversation-store'
import { safeInject } from '@/safe-inject'

const logger: AbstractLogger = safeInject(LOGGER_KEY)
const supabase: SupabaseClientType = safeInject(SUPABASE_CLIENT_KEY)

const session = ref<Session | null>(null)
const router = useRouter()
const conversationStore = useConversationStore()

const redirectToChat = () => {
  if (session.value && router.currentRoute.value.path === '/') {
    router.push('/chat')
  }
}

const handleExtensionMessage = (event: MessageEvent) => {
  const message = event.data

  if (message?.type !== 'navigate-to' || !message.payload?.view) return

  const targetView = message.payload.view
  logger.log('Received navigation request from extension:', targetView)

  const targetRoute = router.getRoutes().find((route) => route.name === targetView)
  if (targetRoute) {
    logger.log('Navigating to:', targetRoute)
    router.push(targetRoute)
  } else {
    logger.warn('Unknown view requested:', targetView)
  }
}

useEventListener(window, 'message', handleExtensionMessage)

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

  supabase.auth.onAuthStateChange((event, session) => {
    handleAuthStateChange(event, session)
  })

  const { data, error } = await supabase.auth.getSession()

  if (error) {
    logger.error('Failed to retrieve auth session, clearing stale data', { error })
    await supabase.auth.signOut()
    return
  }

  if (!data.session) {
    logger.warn('No active session found in App.vue mount')
    return
  }

  session.value = data.session
  redirectToChat()
})

const handleNewChat = async () => {
  await conversationStore.markAllStreamingCompleteInCurrentConversation()
  await router.push({ path: '/chat', query: { newConversation: 'true' } })
}
</script>

<style scoped>
.view-transition-enter-active,
.view-transition-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.view-transition-enter-from {
  opacity: 0;
  transform: translateX(8px);
}

.view-transition-leave-to {
  opacity: 0;
  transform: translateX(-8px);
}
</style>
