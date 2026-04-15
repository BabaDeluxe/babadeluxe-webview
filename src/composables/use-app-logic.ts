import { ref, watch, onMounted, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { useEventListener } from '@vueuse/core'
import type { Session, AuthChangeEvent } from '@supabase/supabase-js'
import { useSettings } from '@/composables/use-settings'
import { useTheme } from '@/composables/use-theme'
import { useConversationStore } from '@/stores/use-conversation-store'
import { useToastStore } from '@/stores/use-toast-store'
import { useStorage } from '@vueuse/core'
import { localStorageKeys } from '@/constants'
import { safeInject } from '@/safe-inject'
import { LOGGER_KEY, SUPABASE_CLIENT_KEY, SOCKET_MANAGER_KEY } from '@/injection-keys'
import type { AbstractLogger } from '@/logger'
import type { SocketManager } from '@/socket-manager'

export function useAppLogic() {
  const logger: AbstractLogger = safeInject(LOGGER_KEY)
  const supabase = safeInject(SUPABASE_CLIENT_KEY)
  const socketManagerRef = safeInject<Ref<SocketManager | undefined>>(SOCKET_MANAGER_KEY)

  const session = ref<Session | null>(null)
  const router = useRouter()
  const conversationStore = useConversationStore()
  const toasts = useToastStore()
  const { settings, loadSettings } = useSettings()
  const { isDark } = useTheme()
  const currentConversationId = useStorage<number>(localStorageKeys.currentConversationId, 0)

  const handleExtensionMessage = (event: MessageEvent) => {
    const message = event.data
    if (message?.type !== 'navigate-to' || !message.payload?.view) return

    const targetView = message.payload.view
    logger.log('Received navigation request from extension:', targetView)

    const targetRoute = router.getRoutes().find((route) => route.name === targetView)
    if (targetRoute) {
      router.push(targetRoute)
    } else {
      logger.warn('Unknown view requested:', targetView)
    }
  }

  useEventListener(window, 'message', handleExtensionMessage)

  const handleNewChat = async () => {
    await conversationStore.markAllStreamingCompleteInCurrentConversation(
      currentConversationId.value
    )
    await router.push({ path: '/chat', query: { newConversation: 'true' } })
  }

  const handleAuthStateChange = (event: AuthChangeEvent, supabaseSession: Session | null) => {
    if (event === 'SIGNED_IN' && supabaseSession) {
      session.value = supabaseSession
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

  onMounted(async () => {
    supabase.auth.onAuthStateChange((event, session) => {
      handleAuthStateChange(event, session)
    })

    watch(
      settings,
      (newSettings) => {
        const themeSetting = newSettings.find((setting) => setting.settingKey === 'theme')
        if (themeSetting?.settingValue) {
          const val = String(themeSetting.settingValue)
          isDark.value = val === 'dark'
        }
      },
      { deep: true }
    )

    const { data, error } = await supabase.auth.getSession()
    if (data.session) void loadSettings()

    if (error) {
      logger.error('Failed to retrieve auth session, clearing stale data', { error })
      await supabase.auth.signOut()
      return
    }

    session.value = data.session
  })

  return {
    session,
    handleNewChat,
  }
}
