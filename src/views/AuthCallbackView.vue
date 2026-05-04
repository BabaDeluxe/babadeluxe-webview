<template>
  <div class="min-h-screen flex flex-col items-center justify-center bg-slate text-bodyText font-sans">
    <div class="flex flex-col items-center gap-6 animate-fade-in">
      <BaseSpinner size="large" />
      <p class="text-xl font-medium tracking-tight">
        {{ statusMessage }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { safeInject } from '@/safe-inject'
import { SUPABASE_CLIENT_KEY, LOGGER_KEY } from '@/injection-keys'
import { useToastStore } from '@/stores/use-toast-store'
import BaseSpinner from '@/components/BaseSpinner.vue'

const router = useRouter()
const supabase = safeInject(SUPABASE_CLIENT_KEY)
const logger = safeInject(LOGGER_KEY)
const toastStore = useToastStore()

const statusMessage = ref('Authenticating...')

onMounted(async () => {
  const hash = window.location.hash
  const query = new URLSearchParams(window.location.search)
  const hashParams = new URLSearchParams(hash.slice(1))

  const error = hashParams.get('error') || query.get('error')
  const errorDescription = hashParams.get('error_description') || query.get('error_description')

  if (error) {
    logger.error('Auth callback error', { error, errorDescription })
    toastStore.error(errorDescription || 'Authentication failed. Please try again.')
    void router.replace('/login')
    return
  }

  const accessToken = hashParams.get('access_token')
  const refreshToken = hashParams.get('refresh_token')
  const code = query.get('code')

  if (accessToken && refreshToken) {
    statusMessage.value = 'Setting up your session...'
    const { error: setSessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })

    if (setSessionError) {
      logger.error('Failed to set session in callback', { error: setSessionError })
      toastStore.error('Session setup failed. Please try again.')
      void router.replace('/login')
      return
    }
  } else if (code) {
    statusMessage.value = 'Exchanging code for session...'
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      logger.error('Failed to exchange code for session', { error: exchangeError })
      toastStore.error('Authentication failed. Please try again.')
      void router.replace('/login')
      return
    }
  } else {
    // If no session info is present, we might already have a session due to detectSessionInUrl
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      logger.warn('No session info found in URL and no active session')
      void router.replace('/login')
      return
    }
  }

  const redirect = router.currentRoute.value.query.redirect as string | undefined
  const destination = redirect ?? '/chat'

  logger.log('Auth successful, redirecting', { destination })
  void router.replace(destination)
})
</script>

<style scoped>
@keyframes fade-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-fade-in {
  animation: fade-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
</style>
