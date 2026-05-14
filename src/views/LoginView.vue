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
            v-if="!showSSOInput"
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
            v-if="!showSSOInput"
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
            v-if="!showSSOInput"
            variant="primary"
            data-testid="login-submit-button"
            type="submit"
            class="w-full justify-center h-12 text-lg font-bold shadow-lg hover:shadow-xl rounded-xl transition-all active:scale-[0.98]"
            :disabled="isLoading"
            :loading="isLoading"
          >
            {{ isSignUp ? 'Create account' : 'Sign In' }}
          </BaseButton>

          <BaseButton
            v-if="showSSOInput"
            variant="primary"
            data-testid="login-sso-submit-button"
            type="button"
            class="w-full justify-center h-12 text-lg font-bold shadow-lg hover:shadow-xl rounded-xl transition-all active:scale-[0.98]"
            :disabled="isLoading"
            :loading="isLoading"
            @click="handleSSOSubmit"
          >
            Continue with SSO
          </BaseButton>

          <div class="flex flex-col gap-3 text-center pt-2">
            <button
              v-if="authConfig.passkeyEnabled && !isSignUp"
              type="button"
              class="text-xs text-subtleText/60 hover:text-accent transition-colors flex items-center justify-center gap-2 mx-auto uppercase tracking-widest font-bold group"
              data-testid="login-passkey-button"
              @click="handlePasskeyLogin"
            >
              <i class="i-ri:fingerprint-line text-sm group-hover:scale-110 transition-transform" />
              Sign in with Passkey
            </button>

            <button
              v-if="authConfig.ssoEnabled && !isSignUp"
              type="button"
              class="text-xs text-subtleText/60 hover:text-accent transition-colors flex items-center justify-center gap-2 mx-auto uppercase tracking-widest font-bold group"
              :class="{ 'text-accent': showSSOInput }"
              data-testid="login-sso-button"
              @click="showSSOInput = !showSSOInput"
            >
              <i
                class="i-ri:shield-keyhole-line text-sm group-hover:rotate-12 transition-transform"
              />
              {{ showSSOInput ? 'Back to password' : 'Sign in with SSO' }}
            </button>
          </div>
        </form>

        <!-- Footer -->
        <div class="text-center text-sm text-subtleText border-t border-borderMuted/30 pt-6">
          {{ isSignUp ? 'Already have an account?' : "Don't have an account?" }}
          <button
            type="button"
            class="text-accent hover:text-accent/80 font-black ml-2 transition-all hover:underline"
            data-testid="login-toggle-mode-button"
            @click="toggleMode"
          >
            {{ isSignUp ? 'Sign in' : 'Create account' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Right Pane: Matrix Animation -->
    <div
      class="flex-1 hidden md:block relative overflow-hidden bg-slate border-l border-borderMuted/10"
    >
      <MatrixRain />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
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
import { authConfig } from '@/auth/auth-config'
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
const showSSOInput = ref(false)

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
  showSSOInput.value = false
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

const handleSSOSubmit = async (): Promise<void> => {
  if (isLoading.value) return
  isLoading.value = true
  error.value = undefined

  if (!email.value || !email.value.includes('@')) {
    emailError.value = 'Valid email is required for SSO'
    isLoading.value = false
    return
  }

  const domain = email.value.split('@')[1]
  const result = await authProvider.signInWithSSO(domain)

  result.match(
    () => {
      logger.log('SSO redirect initiated')
    },
    (e) => {
      error.value = toUserMessage(e)
    }
  )
  isLoading.value = false
}

const handlePasskeyLogin = async (): Promise<void> => {
  if (isLoading.value) return
  isLoading.value = true
  error.value = undefined

  if (!email.value) {
    emailError.value = 'Email is required for passkey login'
    isLoading.value = false
    return
  }

  const result = await authProvider.signInWithPasskey(email.value)
  result.match(
    () => {
      logger.log('Passkey login initiated')
    },
    (e) => {
      error.value = toUserMessage(e)
    }
  )
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
