<template>
  <section
    class="min-h-screen flex flex-col md:flex-row bg-slate text-bodyText font-sans selection:bg-accent selection:text-white overflow-hidden"
  >
    <!-- Left Pane: Login Form -->
    <div
      class="flex-[1.1] flex flex-col justify-center items-center p-6 md:p-12 relative z-10 bg-slate"
    >
      <div class="w-full max-w-md space-y-6 animate-fade-in">
        <!-- Logo & Header -->
        <div class="text-center">
          <div class="inline-flex justify-center mb-4">
            <IconBabaDeluxe class="zoom-1.2" />
          </div>
          <h2 class="text-4xl font-extrabold tracking-tight text-headingText mb-2">
            {{ isSignUp ? 'Create an account' : 'Welcome back' }}
          </h2>
          <p class="text-subtleText text-lg">
            {{
              isSignUp ? 'Sign up to start your AI journey' : 'Sign in to your account to continue'
            }}
          </p>
        </div>

        <!-- Social Logins -->
        <div class="flex flex-col gap-3">
          <BaseButton
            class="w-full justify-center gap-3 border border-borderMuted/30 bg-panel hover:bg-slate text-bodyText transition-all duration-300 py-3 rounded-xl hover:border-accent/50 group"
            data-testid="google-login-button"
            :disabled="isLoading"
            @click="handleGoogleLogin"
          >
            <i class="i-simple-icons:google text-xl group-hover:scale-110 transition-transform" />
            <span class="font-bold">Continue with Google</span>
          </BaseButton>
          <BaseButton
            class="w-full justify-center gap-3 border border-borderMuted/30 bg-panel hover:bg-slate text-bodyText transition-all duration-300 py-3 rounded-xl hover:border-accent/50 group"
            data-testid="github-login-button"
            :disabled="isLoading"
            @click="handleGitHubLogin"
          >
            <i class="i-simple-icons:github text-xl group-hover:scale-110 transition-transform" />
            <span class="font-bold">Continue with GitHub</span>
          </BaseButton>
        </div>

        <!-- Divider -->
        <div class="flex items-center gap-4 py-2">
          <div class="flex-1 h-[1px] bg-gradient-to-r from-transparent to-borderMuted/40"></div>
          <span class="text-xs uppercase tracking-[0.3em] text-subtleText/60 font-black select-none"
            >OR</span
          >
          <div class="flex-1 h-[1px] bg-gradient-to-l from-transparent to-borderMuted/40"></div>
        </div>

        <!-- Form -->
        <form
          class="space-y-6"
          @submit.prevent="handleAuth"
        >
          <BaseInput
            id="login-email-input"
            :model-value="email"
            type="email"
            data-testid="login-email-input"
            label="Email address"
            placeholder="name@company.com"
            :disabled="isLoading"
            :error="emailError"
            :is-required="true"
            @update:model-value="handleEmailChange"
          />

          <div
            class="space-y-1"
          >
            <BaseInput
              id="login-password-input"
              :model-value="password"
              type="password"
              data-testid="login-password-input"
              label="Password"
              placeholder="••••••••"
              :disabled="isLoading"
              :error="passwordError"
              :is-toggleable="true"
              :is-required="true"
              @update:model-value="handlePasswordChange"
            />
          </div>

          <div
            class="flex items-center justify-between text-sm"
          >
            <label class="flex items-center gap-2 cursor-pointer group select-none">
              <input
                v-model="keepSignedIn"
                type="checkbox"
                data-testid="login-keep-signed-in-checkbox"
                class="w-4 h-4 rounded border-borderMuted bg-panel text-accent focus:ring-accent/20 transition-all cursor-pointer"
              />
              <span class="text-subtleText group-hover:text-headingText transition-colors"
                >Keep me signed in</span
              >
            </label>
            <router-link
              to="/reset-password"
              data-testid="login-forgot-password-link"
              class="text-accent hover:text-accent/80 font-bold transition-colors"
            >
              Forgot password?
            </router-link>
          </div>

          <BaseButton
            variant="primary"
            data-testid="login-submit-button"
            type="submit"
            class="w-full justify-center h-12 text-lg font-bold shadow-lg hover:shadow-xl rounded-xl transition-all active:scale-[0.98]"
            :disabled="isLoading"
            :loading="isLoading"
          >
            {{ isSignUp ? 'Create account' : 'Sign In' }}
          </BaseButton>

          <div class="flex flex-col gap-3 text-center pt-2">
            <p class="text-subtleText text-sm">
              {{ isSignUp ? 'Already have an account?' : "Don't have an account?" }}
              <button
                type="button"
                data-testid="login-toggle-mode-button"
                class="text-accent hover:text-accent/80 font-bold transition-colors ml-1 focus:outline-none"
                @click="toggleMode"
              >
                {{ isSignUp ? 'Sign In' : 'Create account' }}
              </button>
            </p>
          </div>
        </form>
      </div>

      <!-- Footer Info -->
      <div class="absolute bottom-6 text-center text-subtleText/40 text-[10px] uppercase tracking-widest">
        &copy; {{ new Date().getFullYear() }} BabaDeluxe AI. Protected by neural encryption.
      </div>
    </div>

    <!-- Right Pane: Cyberpunk Visuals -->
    <div class="hidden md:flex flex-1 relative bg-black overflow-hidden group">
      <MatrixRain />
      <div class="absolute inset-0 bg-gradient-to-l from-black/80 via-transparent to-black/60 pointer-events-none"></div>

      <!-- Floating Stats UI Decoration -->
      <div class="absolute top-12 right-12 p-4 border border-accent/20 bg-black/40 backdrop-blur-md rounded-lg font-mono text-[10px] text-accent/60 space-y-2 pointer-events-none group-hover:border-accent/40 transition-colors">
        <div class="flex justify-between gap-8"><span>CORE_STATUS</span> <span class="text-emerald-500">OPERATIONAL</span></div>
        <div class="flex justify-between gap-8"><span>NEURAL_LOAD</span> <span>42.8%</span></div>
        <div class="flex justify-between gap-8"><span>SYNC_LATENCY</span> <span>12MS</span></div>
        <div class="w-full h-1 bg-accent/10 rounded-full overflow-hidden mt-2">
          <div class="h-full bg-accent/40 w-2/3 animate-pulse"></div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ResultAsync, ok, err, type Result } from 'neverthrow'
import IconBabaDeluxe from '@/components/IconBabaDeluxe.vue'
import MatrixRain from '@/components/MatrixRain.vue'
import BaseButton from '@/components/BaseButton.vue'
import BaseInput from '@/components/BaseInput.vue'
import { useVsCodeAuth } from '@/composables/use-vs-code-auth'
import type { AbstractLogger } from '@/logger'
import { LOGGER_KEY, SUPABASE_CLIENT_KEY, AUTH_PROVIDER_KEY } from '@/injection-keys'
import { safeInject } from '@/safe-inject'
import { AuthError, NetworkError } from '@/errors'
import { toUserMessage } from '@/error-mapper'
import { useToastStore } from '@/stores/use-toast-store'
import type { SupabaseClientType } from '@/main'

const supabase: SupabaseClientType = safeInject(SUPABASE_CLIENT_KEY)
const logger: AbstractLogger = safeInject(LOGGER_KEY)
const authProvider = safeInject(AUTH_PROVIDER_KEY)

const router = useRouter()
const vsCodeAuth = useVsCodeAuth()
const toasts = useToastStore()

const email = ref('')
const password = ref('')
const isSignUp = ref(false)
const keepSignedIn = ref(true)
const error = ref<string | undefined>()
const emailError = ref<string | undefined>()
const passwordError = ref<string | undefined>()
const isLoading = ref(false)
const hasAttemptedStoredSession = ref(false)

watch(
  error,
  (val) => {
    if (val) {
      toasts.error(toUserMessage(val))
    }
  },
  { immediate: true }
)

const handleEmailChange = (value: string | number) => {
  email.value = String(value)
  emailError.value = undefined
}

const handlePasswordChange = (value: string | number) => {
  password.value = String(value)
  passwordError.value = undefined
}

const toggleMode = () => {
  isSignUp.value = !isSignUp.value
  error.value = undefined
  emailError.value = undefined
  passwordError.value = undefined
}

const signUpWithEmail = async (
  emailAddress: string,
  userPassword: string,
  supabaseClient: SupabaseClientType
): Promise<Result<{ needsConfirmation: boolean }, AuthError>> => {
  const result = await ResultAsync.fromPromise(
    supabaseClient.auth.signUp({
      email: emailAddress,
      password: userPassword,
    }),
    (unknownError) => {
      if (unknownError instanceof Error) {
        return new AuthError(unknownError.message, unknownError)
      }
      return new AuthError('Sign up failed', unknownError)
    }
  )

  if (result.isErr()) return err(result.error)
  if (result.value.error) return err(new AuthError(result.value.error.message))

  const needsConfirmation = result.value.data.session === null
  return ok({ needsConfirmation })
}

const signInWithEmail = async (
  emailAddress: string,
  userPassword: string,
  supabaseClient: SupabaseClientType
): Promise<Result<void, AuthError>> => {
  const result = await ResultAsync.fromPromise(
    supabaseClient.auth.signInWithPassword({
      email: emailAddress,
      password: userPassword,
    }),
    (unknownError) => {
      if (unknownError instanceof Error) {
        return new AuthError(unknownError.message, unknownError)
      }
      return new AuthError('Sign in failed', unknownError)
    }
  )

  if (result.isErr()) return err(result.error)
  if (result.value.error) {
    const msg = result.value.error.message
    if (msg.includes('Email not confirmed')) {
      return err(new AuthError('Please confirm your email address before signing in.'))
    }
    return err(new AuthError(msg))
  }

  return ok(undefined)
}

const handleAuth = async (): Promise<void> => {
  if (isLoading.value) return

  isLoading.value = true
  error.value = undefined
  emailError.value = undefined
  passwordError.value = undefined

  if (isSignUp.value) {
    const result = await signUpWithEmail(email.value, password.value, supabase)
    result.match(
      (data) => {
        if (data.needsConfirmation) {
          toasts.success('Sign up successful! Please check your email to confirm your account.')
          isSignUp.value = false
        } else {
          logger.log('User successfully signed up and logged in')
          void navigateAfterLogin()
        }
      },
      (authError) => {
        logger.error('Email sign up failed', { email: email.value, error: authError })
        error.value = toUserMessage(authError)
      }
    )
  } else {
    const result = await signInWithEmail(email.value, password.value, supabase)
    await result.match(
      async () => {
        logger.log('User successfully signed in')
        if (!keepSignedIn.value) {
          window.addEventListener('beforeunload', () => {
            void supabase.auth.signOut()
          })
        }
        await navigateAfterLogin()
      },
      (authError) => {
        logger.error('Email sign in failed', { email: email.value, error: authError })
        error.value = toUserMessage(authError)
        password.value = ''
      }
    )
  }

  isLoading.value = false
}

const navigateAfterLogin = async (): Promise<void> => {
  const redirect = router.currentRoute.value.query.redirect as string | undefined
  const destination = redirect ?? '/chat'

  const navigationResult = await ResultAsync.fromPromise(
    router.push(destination),
    (unknownError) => {
      if (unknownError instanceof Error) {
        return new NetworkError(unknownError.message, unknownError)
      }
      return new NetworkError('Navigation failed', unknownError)
    }
  )

  if (navigationResult.isErr()) {
    logger.error('Failed to navigate after login', {
      error: navigationResult.error,
      destination,
    })
  }
}

onMounted(() => {
  void (async () => {
    if (!vsCodeAuth.isRunningInsideVsCode() || hasAttemptedStoredSession.value) return

    hasAttemptedStoredSession.value = true

    const storedSessionResult = await vsCodeAuth.getStoredSessionFromExtension()
    if (storedSessionResult.isErr()) return

    const storedSession = storedSessionResult.value
    if (!storedSession) return

    const setSessionResult = await vsCodeAuth.setSupabaseSession(supabase, storedSession)

    if (setSessionResult.isErr()) {
      const errorMessage = setSessionResult.error.message
      const isStaleToken =
        errorMessage.includes('Already Used') ||
        errorMessage.includes('Invalid Refresh Token') ||
        errorMessage.includes('refresh_token_reuse_detected')

      if (isStaleToken) {
        logger.warn('[LoginView] Stored session has stale refresh token, clearing silently')
        vsCodeAuth.clearStoredSession()
        return
      }

      logger.error(
        '[LoginView] Stored VS Code session existed but setting Supabase session failed',
        {
          error: setSessionResult.error,
        }
      )
      error.value = toUserMessage(setSessionResult.error, 'Session expired. Please sign in again.')
      vsCodeAuth.clearStoredSession()
      return
    }

    await navigateAfterLogin()
  })()
})

const handleGitHubLogin = async (): Promise<void> => {
  await handleOAuthLogin('github')
}

const handleGoogleLogin = async (): Promise<void> => {
  await handleOAuthLogin('google')
}

const handleOAuthLogin = async (provider: 'github' | 'google'): Promise<void> => {
  if (isLoading.value) return

  isLoading.value = true
  error.value = undefined

  const providerName = provider.charAt(0).toUpperCase() + provider.slice(1)

  if (vsCodeAuth.isRunningInsideVsCode()) {
    const oauthResult = await vsCodeAuth.requestOAuthLoginFromExtension(provider)

    if (oauthResult.isErr()) {
      logger.error(
        `${providerName} OAuth failed in VS Code mode, falling back to direct Supabase login`,
        {
          error: oauthResult.error.message,
        }
      )
    } else {
      if (!oauthResult.value) {
        logger.warn(`${providerName} OAuth aborted by user`)
        isLoading.value = false
        return
      }

      const setSessionResult = await vsCodeAuth.setSupabaseSession(supabase, oauthResult.value)
      if (setSessionResult.isErr()) {
        logger.error(`${providerName} OAuth succeeded but session setup failed`, {
          error: setSessionResult.error.message,
        })
        error.value = toUserMessage(setSessionResult.error)
        isLoading.value = false
        return
      }

      await navigateAfterLogin()
      isLoading.value = false
      return
    }
  }

  const result = await authProvider.signInWithOAuth(provider)

  result.match(
    async () => {
      logger.log(`${providerName} OAuth succeeded through direct Supabase login`)
    },
    (authError) => {
      logger.error(`${providerName} OAuth failed in browser mode`, {
        error: authError.message,
      })
      error.value = toUserMessage(authError)
    }
  )

  isLoading.value = false
}
</script>

<style scoped>
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fade-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
</style>
