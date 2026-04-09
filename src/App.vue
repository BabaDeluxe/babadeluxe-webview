<template>
  <div
    class="h-100vh max-h-100vh min-h-100vh max-w-100vw min-w-100vw bg-slate flex flex-col font-onest text-deepText overflow-x-hidden"
  >
    <div v-if="session && $route.path !== '/'">
      <header
        class="flex items-center justify-between p-2 bg-panel border-b border-borderMuted/20"
        data-testid="app-header"
      >
        <IconBabaDeluxe />

        <div class="flex flex-row gap-2 justify-end items-center">
          <BaseButton
            data-testid="nav-new-chat-button"
            variant="primary"
            icon="i-weui:pencil-outlined"
            text="New Chat"
            @click="handleNewChat"
          />

          <BaseButton
            data-testid="nav-settings-button"
            variant="ghost"
            icon="i-weui:setting-outlined"
            class="zoom-1.2"
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
              variant="menu"
              data-testid="nav-chat-link"
              :is-selected="isExactActive"
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
              variant="menu"
              data-testid="nav-history-link"
              :is-selected="isExactActive"
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
              variant="menu"
              data-testid="nav-prompts-link"
              :is-selected="isExactActive"
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
              <Transition mode="out-in">
                <KeepAlive :include="['ChatView', 'HistoryView', 'PromptsView']">
                  <component
                    :is="Component"
                    class="flex-1 min-h-0 flex flex-col animate-fade-in animate-duration-150 animate-ease-out"
                  />
                </KeepAlive>
              </Transition>
            </RouterView>
          </div>
        </Suspense>
      </template>
    </Suspense>
    <ToastLayer />
  </div>
</template>

<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { RouterLink, RouterView, useRouter } from 'vue-router'
import { type Ref, watch, onMounted, ref, onErrorCaptured } from 'vue'
import { useEventListener } from '@vueuse/core'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import IconBabaDeluxe from '@/components/IconBabaDeluxe.vue'
import BaseButton from '@/components/BaseButton.vue'
import ToastLayer from '@/components/ToastLayer.vue'
import { useSettings } from '@/composables/use-settings'
import { useTheme } from '@/composables/use-theme'
import type { AbstractLogger } from '@/logger'
import { useConversationStore } from '@/stores/use-conversation-store'
import { type SupabaseClientType } from '@/main'
import { useToastStore } from '@/stores/use-toast-store'
import { localStorageKeys } from '@/constants'
import { safeInject } from '@/safe-inject'
import type { SocketManager } from '@/socket-manager'
import { LOGGER_KEY, SUPABASE_CLIENT_KEY, SOCKET_MANAGER_KEY } from '@/injection-keys'
import { isOfflineMode } from '@/env-validator'

const logger: AbstractLogger = safeInject(LOGGER_KEY)
const supabase: SupabaseClientType = safeInject(SUPABASE_CLIENT_KEY)
const socketManagerRef = safeInject<Ref<SocketManager | undefined>>(SOCKET_MANAGER_KEY)

const session = ref<Session | null>(null)
const router = useRouter()
const conversationStore = useConversationStore()
const toasts = useToastStore()
const { settings, loadSettings } = useSettings()
const { isDark } = useTheme()

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

const currentConversationId = useStorage<number>(localStorageKeys.currentConversationId, 0)

const handleNewChat = async () => {
  await conversationStore.markAllStreamingCompleteInCurrentConversation(currentConversationId.value)
  await router.push({ path: '/chat', query: { newConversation: 'true' } })
}

onMounted(async () => {
  const handleAuthStateChange = (event: AuthChangeEvent, supabaseSession: Session | null) => {
    if (event === 'SIGNED_IN' && supabaseSession) {
      session.value = supabaseSession
      // No redirect here – LoginView / router guard already decide destination
    } else if (event === 'SIGNED_OUT') {
      session.value = null
      router.push('/')
    } else if (
      (event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') &&
      supabaseSession?.access_token
    ) {
      session.value = supabaseSession
      if (socketManagerRef.value) {
        socketManagerRef.value.updateAuthToken(supabaseSession.access_token)
        logger.debug('Updated socket auth token from session refresh')
      }
    } else if (event === 'PASSWORD_RECOVERY') {
      router.push('/reset-password')
    }
  }

  if (isOfflineMode()) {
    logger.info('App started in OFFLINE MODE')
    void loadSettings()
    session.value = { user: { id: 'offline-user' } } as any
    return
  }

  supabase.auth.onAuthStateChange((event, session) => {
    handleAuthStateChange(event, session)
  })

  // Watch for theme setting changes from DB (or initial load)
  watch(
    settings,
    (newSettings) => {
      const themeSetting = newSettings.find((setting) => setting.settingKey === 'theme')
      if (themeSetting?.settingValue) {
        const val = String(themeSetting.settingValue)
        if (val === 'dark' && !isDark.value) isDark.value = true
        else if (val === 'light' && isDark.value) isDark.value = false
      }
    },
    { deep: true }
  )

  const { data, error } = await supabase.auth.getSession()

  // Start loading settings immediately to apply theme
  if (data.session) void loadSettings()

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
})

onErrorCaptured((err, instance, info) => {
  logger.error('Something crashed', {
    vueInfo: info,
    componentName: instance?.$options?.name,
    error: err,
  })

  toasts.error('Something crashed. Please reload.')

  return false
})
</script>
