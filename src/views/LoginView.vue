<template>
  <section
    id="login"
    data-testid="login-view-container"
  >
    <div
      class="flex flex-col items-center justify-center w-full h-full bg-slate text-deepText font-onest p-4"
    >
      <div class="flex flex-row justify-center items-center">
        <IconBabaDeluxe class="flex flex-1" />

        <div class="flex flex-2 justify-center items-center">
          <h2 class="text-2xl font-bold text-accent">BabaDeluxe Login</h2>
        </div>
      </div>

      <div
        class="flex flex-col w-full max-w-md bg-panel rounded-lg shadow-lg p-6 my-4 border border-borderMuted"
      >
        <div class="flex flex-col gap-4">
          <BaseButton
            variant="primary"
            data-testid="login-github-button"
            text="Login with GitHub"
            icon="i-simple-icons:github"
            :disabled="isLoading"
            type="button"
            @click="handleGitHubLogin"
          />

          <BaseButton
            variant="primary"
            data-testid="login-google-button"
            text="Login with Google"
            icon="i-simple-icons:google"
            :disabled="isLoading"
            type="button"
            @click="handleGoogleLogin"
          />
        </div>

        <div class="text-center text-subtleText my-4">or</div>

        <form
          class="flex flex-col gap-4"
          autocomplete="on"
          data-testid="login-form"
          @submit.prevent="handleAuth"
        >
          <BaseInput
            data-testid="login-email-input"
            aria-label="Email Address"
            :model-value="email"
            type="email"
            placeholder="Email"
            :is-disabled="isLoading"
            :is-required="true"
            :error="emailError"
            @update:model-value="handleEmailChange"
          />

          <BaseInput
            data-testid="login-password-input"
            aria-label="Password"
            :model-value="password"
            type="password"
            placeholder="Password"
            :is-disabled="isLoading"
            :is-required="true"
            :is-toggleable="true"
            :error="passwordError"
            @update:model-value="handlePasswordChange"
          />

          <router-link
            v-if="!isSignUp"
            to="/reset-password"
            class="w-full flex"
          >
            <BaseButton
              v-if="!isSignUp"
              variant="primary"
              class="w-full"
              data-testid="login-forgot-password-button"
              text="Forgot Password?"
              :disabled="isLoading"
              type="button"
              @click="handleForgotPassword"
            />
          </router-link>

          <BaseButton
            variant="primary"
            data-testid="login-submit-button"
            type="submit"
            :text="isSignUp ? 'Sign Up' : 'Sign In'"
            :disabled="isLoading"
            :loading="isLoading"
          />
          <BaseButton
            variant="primary"
            data-testid="login-toggle-mode-button"
            type="button"
            :text="isSignUp ? 'Switch to Sign In' : 'Switch to Sign Up'"
            :disabled="isLoading"
            @click="toggleMode"
          />
        </form>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ResultAsync, ok, err, type Result } from 'neverthrow'
import { useRouter } from 'vue-router'
import type { AbstractLogger } from '@/logger'
import IconBabaDeluxe from '@/components/IconBabaDeluxe.vue'
import BaseButton from '@/components/BaseButton.vue'
import BaseInput from '@/components/BaseInput.vue'
import { useVsCodeAuth } from '@/composables/use-vs-code-auth'
import type { SupabaseClientType } from '@/main'
import { LOGGER_KEY, SUPABASE_CLIENT_KEY } from '@/injection-keys'
import { safeInject } from '@/safe-inject'
import { AuthError, NetworkError } from '@/errors'
import { toUserMessage } from '@/error-mapper'
import { useToastStore } from '@/stores/use-toast-store'
import { watch } from 'vue'

const supabase: SupabaseClientType = safeInject(SUPABASE_CLIENT_KEY)
const logger: AbstractLogger = safeInject(LOGGER_KEY)

const router = useRouter()
const vsCodeAuth = useVsCodeAuth()
const toasts = useToastStore()

const email = ref('')
const password = ref('')
const isSignUp = ref(false)
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
): Promise<Result<void, AuthError>> => {
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

  return ok(undefined)
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
  if (result.value.error) return err(new AuthError(result.value.error.message))

  return ok(undefined)
}

const signInWithSupabaseOAuth = async (
  supabaseClient: SupabaseClientType,
  provider: 'github' | 'google' = 'github'
): Promise<Result<void, AuthError>> => {
  const result = await ResultAsync.fromPromise(
    supabaseClient.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${globalThis.location.origin}/auth/callback`,
      },
    }),
    (unknownError) => {
      if (unknownError instanceof Error) {
        return new AuthError(unknownError.message, unknownError)
      }
      return new AuthError(`${provider.charAt(0).toUpperCase() + provider.slice(1)} OAuth failed`, unknownError)
    }
  )

  if (result.isErr()) return err(result.error)
  if (result.value.error) return err(new AuthError(result.value.error.message))

  return ok(undefined)
}

const handleAuth = async (): Promise<void> => {
  if (isLoading.value) return

  isLoading.value = true
  error.value = undefined
  emailError.value = undefined
  passwordError.value = undefined

  const authAction = isSignUp.value ? 'sign up' : 'sign in'
  const result = isSignUp.value
    ? await signUpWithEmail(email.value, password.value, supabase)
    : await signInWithEmail(email.value, password.value, supabase)

  await result.match(
    async () => {
      logger.log(`User successfully ${authAction === 'sign up' ? 'signed up' : 'signed in'}`)
      await navigateAfterLogin()
    },
    (authError) => {
      logger.error(`Email ${authAction} failed`, {
        email: email.value,
        error: authError,
      })
      error.value = toUserMessage(authError)
      password.value = ''
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
    if (!vsCodeAuth?.isRunningInsideVsCode() || hasAttemptedStoredSession.value) return

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

const handleForgotPassword = async (): Promise<void> => {
  if (isLoading.value) return

  const navigationResult = await ResultAsync.fromPromise(
    router.push('/reset-password'),
    (unknownError) => {
      if (unknownError instanceof Error) {
        return new NetworkError(unknownError.message, unknownError)
      }
      return new NetworkError('Navigation failed', unknownError)
    }
  )

  if (navigationResult.isErr()) {
    logger.error('Failed to navigate to password reset', {
      error: navigationResult.error,
    })
  }
}

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

  if (vsCodeAuth?.isRunningInsideVsCode()) {
    const oauthResult = await vsCodeAuth.requestOAuthLoginFromExtension(provider)

    if (oauthResult.isOk()) {
      if (!oauthResult.value) {
        logger.warn(`${providerName} OAuth aborted by user`)
        isLoading.value = false
        return
      }

      const setSessionResult = await vsCodeAuth.setSupabaseSession(supabase, oauthResult.value)
      if (setSessionResult.isOk()) {
        await navigateAfterLogin()
        isLoading.value = false
        return
      }

      logger.error(`${providerName} OAuth succeeded but session setup failed`, {
        error: setSessionResult.error.message,
      })
      error.value = toUserMessage(setSessionResult.error)
      isLoading.value = false
      return
    }

    logger.error(`${providerName} OAuth failed in VS Code mode, falling back to direct Supabase login`, {
      error: oauthResult.error.message,
    })
  }

  const result = await signInWithSupabaseOAuth(supabase, provider)

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
