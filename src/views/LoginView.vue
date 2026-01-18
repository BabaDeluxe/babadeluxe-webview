<template>
  <section id="login">
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
          <BaseInput
            :model-value="email"
            type="email"
            placeholder="Email"
            :disabled="isLoading"
            :required="true"
            :error="emailError"
            @update:model-value="
              (value) => {
                email = String(value)
                emailError = undefined
              }
            "
          />

          <BaseInput
            :model-value="password"
            type="password"
            placeholder="Password"
            :disabled="isLoading"
            :required="true"
            :toggleable="true"
            :error="passwordError"
            @update:model-value="
              (value) => {
                password = String(value)
                passwordError = undefined
              }
            "
          />
          <router-link
            v-if="!isSignUp"
            to="/reset-password"
            class="w-full flex"
          >
            <BaseButton
              class="w-full"
              text="Forgot Password?"
              :disabled="isLoading"
            />
          </router-link>

          <BaseButton
            type="submit"
            :text="isSignUp ? 'Sign Up' : 'Sign In'"
            :disabled="isLoading"
            :loading="isLoading"
          />
          <BaseButton
            type="button"
            :text="isSignUp ? 'Switch to Sign In' : 'Switch to Sign Up'"
            :disabled="isLoading"
            @click="toggleMode"
          />
        </form>

        <BaseAlert
          v-if="error"
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
import { inject, ref } from 'vue'
import { ResultAsync, ok, err, type Result } from 'neverthrow'
import type { ConsoleLogger } from '@simwai/utils'
import IconBabaDeluxe from '../components/IconBabaDeluxe.vue'
import BaseButton from '../components/BaseButton.vue'
import BaseInput from '../components/BaseInput.vue'
import BaseAlert from '../components/BaseAlert.vue'
import type { SupabaseClientType } from '@/main'
import { LOGGER_KEY, SUPABASE_CLIENT_KEY } from '@/injection-keys'

const supabase: SupabaseClientType = inject(SUPABASE_CLIENT_KEY)!
const logger: ConsoleLogger = inject(LOGGER_KEY)!

const email = ref('')
const password = ref('')
const isSignUp = ref(false)
const error = ref<string | undefined>()
const emailError = ref<string | undefined>()
const passwordError = ref<string | undefined>()
const isLoading = ref(false)

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

  result.match(
    () => {
      logger.log(`User successfully ${authAction === 'sign up' ? 'signed up' : 'signed in'}`)
    },
    (authError) => {
      logger.error(`Email ${authAction} failed after user clicked button:`, authError)
      error.value = authError.message
      password.value = ''
    }
  )

  isLoading.value = false
}
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
const handleGitHubLogin = async (): Promise<void> => {
  if (isLoading.value) return

  isLoading.value = true
  error.value = undefined

  const result = await loginWithGitHub(supabase)

  result.match(
    () => {
      logger.log('GitHub OAuth initiated successfully')
    },
    (oauthError) => {
      logger.error('GitHub OAuth login failed after user clicked button:', oauthError)
      error.value = oauthError.message
    }
  )

  isLoading.value = false
}
</script>
