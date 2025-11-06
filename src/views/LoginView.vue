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
          @click="loginWithGitHub"
        />

        <div class="text-center text-subtleText my-4">or</div>

        <form class="flex flex-col gap-4" autocomplete="on" @submit.prevent="handleAuth">
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
          <router-link to="/reset-password" class="w-full flex">
            <ButtonItem
              v-if="!isSignUp"
              class="w-full"
              text="Forgot Password?"
              :disabled="isLoading"
            />
          </router-link>
          <!-- MAIN BUTTON: Now triggers handleAuth on click -->
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

        <p v-if="error" class="text-error mt-4">
          {{ error }}
        </p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { inject, ref } from 'vue'
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
const error = ref<string | null>(null)
const isLoading = ref(false)
const isResetEmailSent = ref(false)

const toggleMode = () => {
  isSignUp.value = !isSignUp.value
  error.value = null
  isResetEmailSent.value = false
}

const handleAuth = async () => {
  if (isLoading.value) return
  isLoading.value = true
  error.value = null
  isResetEmailSent.value = false

  try {
    let result
    if (isSignUp.value) {
      result = await supabase.auth.signUp({
        email: email.value,
        password: password.value,
      })
    } else {
      result = await supabase.auth.signInWithPassword({
        email: email.value,
        password: password.value,
      })
    }

    if (result.error) throw result.error
  } catch (error_: unknown) {
    error.value = error_ instanceof Error ? error_.message : String(error_)
    password.value = ''
  } finally {
    isLoading.value = false
  }
}

const loginWithGitHub = async () => {
  if (isLoading.value) return

  isLoading.value = true
  error.value = null

  const { error: oauthError } = await supabase.auth.signInWithOAuth({
    provider: 'github',
  })

  if (oauthError) logger.trace(oauthError)

  isLoading.value = false
}
</script>
