<script setup lang="ts">
import { ref, onMounted, provide, watch, onErrorCaptured } from 'vue'
import { useRouter } from 'vue-router'
import type { Session } from '@supabase/supabase-js'
import { useDark, useToggle } from '@vueuse/core'
import { useSettings } from '@/composables/use-settings'
import { useToastStore } from '@/stores/use-toast-store'
import {
  LOGGER_KEY,
  SOCKET_MANAGER_KEY,
  SUPABASE_CLIENT_KEY,
} from '@/injection-keys'
import { safeInject } from '@/safe-inject'
import { isOfflineMode } from '@/env-validator'

const logger = safeInject(LOGGER_KEY)
const supabase = safeInject(SUPABASE_CLIENT_KEY)
const socketManagerRef = safeInject(SOCKET_MANAGER_KEY)
const toasts = useToastStore()
const router = useRouter()

const isDark = useDark()
const toggleDark = useToggle(isDark)
provide('isDark', isDark)
provide('toggleDark', toggleDark)

const session = ref<Session | null>(null)
const { settings, loadSettings } = useSettings()

const offline = isOfflineMode()

onMounted(async () => {
  if (offline) {
    logger.info('App started in OFFLINE MODE')
    void loadSettings()
    return
  }

  const handleAuthStateChange = (event: string, supabaseSession: Session | null) => {
    if (event === 'SIGNED_IN' && supabaseSession?.access_token) {
      session.value = supabaseSession
      if (socketManagerRef.value) {
        socketManagerRef.value.updateAuthToken(supabaseSession.access_token)
        logger.debug('Updated socket auth token from session sign-in')
      }
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
    componentName: instance?.?.name,
    error: err,
  })

  toasts.error('Something crashed. Please reload.')

  return false
})
</script>

<template>
  <div
    class="min-h-screen bg-bg text-text selection:bg-accent selection:text-white transition-colors duration-300"
    :class="{ dark: isDark }"
  >
    <router-view />
  </div>
</template>

<style>
@font-face {
  font-family: 'Onest';
  src: url('@/assets/Onest-VariableFont_wght.ttf') format('truetype');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

body {
  font-family: 'Onest', sans-serif;
}
</style>
