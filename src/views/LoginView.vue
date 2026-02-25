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
        <BaseButton
          variant="primary"
          data-testid="login-github-button"
          text="Login with GitHub"
          icon="i-simple-icons:github"
          :disabled="isLoading"
          type="submit"
          @click="handleGitHubLogin"
        />

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

        <BaseAlert
          v-if="error"
          class="pt-4"
          data-testid="login-error-alert"
          :message="error"
          type="error"
          :is-dismissible="true"
          @close="error = undefined"
        />
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
import BaseAlert from '@/components/BaseAlert.vue'
import { useVsCodeAuth } from '@/composables/use-vs-code-auth'
import type { SupabaseClientType } from '@/main'
import { LOGGER_KEY, SUPABASE_CLIENT_KEY } from '@/injection-keys'
import { safeInject } from '@/safe-inject'
import { AuthError, NetworkError } from '@/errors'

const supabase: SupabaseClientType = safeInject(SUPABASE_CLIENT_KEY)
const logger: AbstractLogger = safeInject(LOGGER_KEY)

const router = useRouter()
const vsCodeAuth = useVsCodeAuth()

const email = ref('')
const password = ref('')
const isSignUp = ref(false)
const error = ref<string | undefined>()
const emailError = ref<string | undefined>()
const passwordError = ref<string | undefined>()
const isLoading = ref(false)
const hasAttemptedStoredSession = ref(false)

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
      error.value = authError.message
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
      error.value = 'Session expired. Please sign in again.'
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
  if (isLoading.value) return

  isLoading.value = true
  error.value = undefined

  if (vsCodeAuth?.isRunningInsideVsCode()) {
    const oauthResult = await vsCodeAuth.requestGitHubLoginFromExtension()

    if (oauthResult.isErr()) {
      logger.error('GitHub OAuth failed in VS Code mode', {
        error: oauthResult.error,
      })
      error.value = oauthResult.error.message
      isLoading.value = false
      return
    }

    if (!oauthResult.value) {
      logger.warn('GitHub OAuth aborted by user')
      isLoading.value = false
      return
    }

    const setSessionResult = await vsCodeAuth.setSupabaseSession(supabase, oauthResult.value)
    if (setSessionResult.isErr()) {
      logger.error('GitHub OAuth succeeded but session setup failed', {
        error: setSessionResult.error,
      })
      error.value = setSessionResult.error.message
      isLoading.value = false
      return
    }

    await navigateAfterLogin()
    isLoading.value = false
    return
  }

  const browserResult = await ResultAsync.fromPromise(
    supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `http://127.0.0.1:5100/auth/callback`,
      },
    }),
    (unknownError) => {
      if (unknownError instanceof Error) {
        return new AuthError(unknownError.message, unknownError)
      }
      return new AuthError('GitHub OAuth failed', unknownError)
    }
  )

  if (browserResult.isErr()) {
    logger.error('GitHub OAuth failed in browser mode', {
      error: browserResult.error,
    })
    error.value = browserResult.error.message
  } else if (browserResult.value.error) {
    const authError = new AuthError(browserResult.value.error.message)
    logger.error('GitHub OAuth failed in browser mode', {
      error: authError,
    })
    error.value = authError.message
  }

  isLoading.value = false
}
</script>
