<template>
  <section id="login">
    <div
      class="flex flex-col items-center justify-center w-full h-full bg-slate text-deepText font-onest p-4"
    >
      <div class="flex flex-row justify-center items-center">
        <BabaDeluxeIcon class="flex flex-1" />

        <div class="flex flex-2 justify-center items-center">
          <h2 class="text-2xl font-bold text-accent">BabaDeluxe Login</h2>
        </div>
      </div>

      <div
        class="flex flex-col w-full max-w-md bg-panel rounded-lg shadow-lg p-6 my-4 border border-borderMuted"
      >
        <ButtonItem
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
          @submit.prevent="handleAuth"
        >
          <input
            v-model="email"
            type="email"
            placeholder="Email"
            class="bg-codeBg border border-borderMuted rounded py-2 px-3 text-deepText focus:outline-none focus:border-accent"
            required
            aria-label="Email Address"
            autocomplete="email"
          />

          <input
            v-model="password"
            type="password"
            placeholder="Password"
            class="bg-codeBg border border-borderMuted rounded py-2 px-3 text-deepText focus:outline-none focus:border-accent"
            required
            aria-label="Password"
            autocomplete="current-password"
          />

          <!-- Forgot Password button (only show during sign-in) -->
          <router-link
            to="/reset-password"
            class="w-full flex"
          >
            <ButtonItem
              v-if="!isSignUp"
              class="w-full"
              text="Forgot Password?"
              :disabled="isLoading"
            />
          </router-link>

          <ButtonItem
            type="button"
            :text="isSignUp ? 'Sign Up' : 'Sign In'"
            :disabled="isLoading"
            @click="handleAuth"
          />
          <ButtonItem
            type="button"
            :text="isSignUp ? 'Switch to Sign In' : 'Switch to Sign Up'"
            :disabled="isLoading"
            @click="toggleMode"
          />
        </form>

        <p
          v-if="error"
          class="text-error mt-4"
        >
          {{ error }}
        </p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { inject, ref } from 'vue'
import { ResultAsync, ok, err, type Result } from 'neverthrow'
import type { ConsoleLogger } from '@simwai/utils'
import BabaDeluxeIcon from '../components/BabaDeluxeIcon.vue'
import ButtonItem from '../components/ButtonItem.vue'
import type { SupabaseClientType } from '@/main'
import { LOGGER_KEY, SUPABASE_CLIENT_KEY } from '@/injection-keys'

const supabase: SupabaseClientType = inject(SUPABASE_CLIENT_KEY)!
const logger: ConsoleLogger = inject(LOGGER_KEY)!

const email = ref('')
const password = ref('')
const isSignUp = ref(false)
const error = ref<string | undefined>()
const isLoading = ref(false)

const toggleMode = () => {
  isSignUp.value = !isSignUp.value
  error.value = undefined
}

// Performs email/password sign-up via Supabase
const signUpWithEmail = async (
  emailAddress: string,
  userPassword: string,
  supabaseClient: SupabaseClientType
): Promise<Result<void, Error>> => {
  const result = await ResultAsync.fromPromise(
    supabaseClient.auth.signUp({
      email: emailAddress,
      password: userPassword,
    }),
    (unknownError) => new Error(String(unknownError))
  )

  if (result.isErr()) {
    return err(result.error)
  }

  if (result.value.error) {
    return err(new Error(result.value.error.message))
  }

  return ok(undefined)
}

// Performs email/password sign-in via Supabase
const signInWithEmail = async (
  emailAddress: string,
  userPassword: string,
  supabaseClient: SupabaseClientType
): Promise<Result<void, Error>> => {
  const result = await ResultAsync.fromPromise(
    supabaseClient.auth.signInWithPassword({
      email: emailAddress,
      password: userPassword,
    }),
    (unknownError) => new Error(String(unknownError))
  )

  if (result.isErr()) {
    return err(result.error)
  }

  if (result.value.error) {
    return err(new Error(result.value.error.message))
  }

  return ok(undefined)
}

// Handles email/password authentication (sign-up or sign-in)
const handleAuth = async (): Promise<void> => {
  if (isLoading.value) return

  isLoading.value = true
  error.value = undefined

  const authAction = isSignUp.value ? 'sign up' : 'sign in'
  const result = isSignUp.value
    ? await signUpWithEmail(email.value, password.value, supabase)
    : await signInWithEmail(email.value, password.value, supabase)

  result.match(
    () => {
      logger.log(`User successfully ${authAction === 'sign up' ? 'signed up' : 'signed in'}`)
      // Navigation happens automatically via Supabase auth state change
    },
    (authError) => {
      logger.error(`Email ${authAction} failed after user clicked button:`, authError)
      error.value = authError.message
      password.value = ''
    }
  )

  isLoading.value = false
}

// Initiates GitHub OAuth login
const loginWithGitHub = async (
  supabaseClient: SupabaseClientType
): Promise<Result<void, Error>> => {
  const result = await ResultAsync.fromPromise(
    supabaseClient.auth.signInWithOAuth({
      provider: 'github',
    }),
    (unknownError) => new Error(String(unknownError))
  )

  if (result.isErr()) {
    return err(result.error)
  }

  if (result.value.error) {
    return err(new Error(result.value.error.message))
  }

  return ok(undefined)
}

// Handles GitHub OAuth login button click
const handleGitHubLogin = async (): Promise<void> => {
  if (isLoading.value) return

  isLoading.value = true
  error.value = undefined

  const result = await loginWithGitHub(supabase)

  result.match(
    () => {
      logger.log('GitHub OAuth initiated successfully')
      // Redirect happens automatically
    },
    (oauthError) => {
      logger.error('GitHub OAuth login failed after user clicked button:', oauthError)
      error.value = oauthError.message
    }
  )

  isLoading.value = false
}
</script>
