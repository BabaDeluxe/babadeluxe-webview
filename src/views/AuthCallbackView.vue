<template>
  <div
    class="min-h-screen flex flex-col items-center justify-center bg-slate text-bodyText font-sans"
  >
    <div
      v-if="!error"
      class="flex flex-col items-center gap-6 animate-fade-in"
    >
      <BaseSpinner size="large" />
      <p class="text-xl font-medium tracking-tight">
        {{ statusMessage }}
      </p>
    </div>
    <div
      v-else
      class="flex flex-col items-center gap-6 animate-fade-in text-center p-6"
    >
      <div class="i-ri:error-warning-line text-6xl text-accent mb-2" />
      <h1 class="text-3xl font-bold text-headingText">Authentication Failed</h1>
      <p class="text-subtleText max-w-md">
        {{ error }}
      </p>
      <BaseButton
        variant="primary"
        class="mt-4"
        @click="router.replace('/login')"
      >
        Back to login
      </BaseButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ResultAsync } from 'neverthrow'
import { safeInject } from '@/safe-inject'
import { SUPABASE_CLIENT_KEY, LOGGER_KEY } from '@/injection-keys'
import { useToastStore } from '@/stores/use-toast-store'
import { isOfflineMode } from '@/env-validator'
import BaseSpinner from '@/components/BaseSpinner.vue'
import BaseButton from '@/components/BaseButton.vue'

const router = useRouter()
const supabase = safeInject(SUPABASE_CLIENT_KEY)
const logger = safeInject(LOGGER_KEY)
const toastStore = useToastStore()

const statusMessage = ref('Authenticating...')
const error = ref<string | null>(null)

onMounted(async () => {
  if (isOfflineMode()) {
    void router.replace('/chat')
    return
  }

  const hash = window.location.hash
  const query = new URLSearchParams(window.location.search)
  const hashParams = new URLSearchParams(hash.slice(1))

  const errorCode = hashParams.get('error') || query.get('error')

  const errorDescription = hashParams.get('error_description') || query.get('error_description')

  if (errorCode) {
    logger.error('Auth callback error', { error: errorCode, errorDescription })
    error.value = errorDescription || 'Authentication failed. Please try again.'
    toastStore.error(error.value)
    return
  }

  const accessToken = hashParams.get('access_token')
  const refreshToken = hashParams.get('refresh_token')

  const code = query.get('code')

  if (accessToken && refreshToken) {
    statusMessage.value = 'Setting up your session...'

    const result = await ResultAsync.fromPromise(
      supabase.auth.setSession({
        /* eslint-disable @typescript-eslint/naming-convention */
        access_token: accessToken,
        refresh_token: refreshToken,
        /* eslint-enable @typescript-eslint/naming-convention */
      }),
      (e: unknown) => new Error(e instanceof Error ? e.message : 'Session setup failed')
    )

    if (result.isErr() || result.value.error) {
      const msg = result.isErr() ? result.error.message : result.value.error?.message
      logger.error('Failed to set session in callback', { error: msg })
      error.value = 'Session setup failed. Please try again.'
      toastStore.error(error.value)
      return
    }
  } else if (code) {
    statusMessage.value = 'Exchanging code for session...'

    const result = await ResultAsync.fromPromise(
      supabase.auth.exchangeCodeForSession(code),
      (e: unknown) => new Error(e instanceof Error ? e.message : 'Code exchange failed')
    )

    if (result.isErr() || result.value.error) {
      const msg = result.isErr() ? result.error.message : result.value.error?.message
      logger.error('Failed to exchange code for session', { error: msg })
      error.value = 'Authentication failed. Please try again.'
      toastStore.error(error.value)
      return
    }
  } else {
    // If no session info is present, we might already have a session due to detectSessionInUrl
    const {
      data: { session },
    } = await supabase.auth.getSession()
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
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fade-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
</style>
