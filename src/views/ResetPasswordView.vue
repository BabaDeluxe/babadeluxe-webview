<template>
  <section id="password-reset">
    <div
      class="flex flex-col items-center justify-center w-full h-full bg-slate text-deepText font-onest p-4"
    >
      <div
        class="flex flex-col w-full max-w-md bg-panel rounded-lg shadow-lg p-6 my-4 border border-borderMuted"
      >
        <h2 class="text-2xl font-bold text-accent mb-4">Forgot Password</h2>
        <p class="text-subtleText mb-4">
          Enter your email address and we'll send you a reset link.
        </p>

        <form
          class="flex flex-col gap-4"
          @submit.prevent="handleSendResetEmail"
        >
          <input
            v-model="email"
            type="email"
            placeholder="Email"
            class="bg-codeBg border border-borderMuted rounded-lgpy-2 px-3 text-deepText focus:outline-none focus:border-accent"
            required
            aria-label="Email Address"
            autocomplete="email"
          />

          <BaseButton
            variant="primary"
            aria-label="Send Reset Link"
            type="submit"
            text="Send Reset Link"
            :disabled="isLoading || !email"
          />

          <BaseButton
            variant="primary"
            aria-label="Back to Login"
            type="button"
            text="Back to Login"
            :disabled="isLoading"
            @click="router.push('/login')"
          />
        </form>

        <p
          v-if="error"
          aria-label="Password Reset Error"
          class="text-error mt-4"
        >
          {{ error }}
        </p>
        <p
          v-if="success"
          aria-label="Password Reset Success"
          class="text-accent mt-4"
        >
          Reset link sent! Check your email inbox.
        </p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { AbstractLogger } from '@/logger'
import { ok, err, type Result } from 'neverthrow'
import BaseButton from '../components/BaseButton.vue'
import type { SupabaseClientType } from '@/main'
import { SUPABASE_CLIENT_KEY, LOGGER_KEY } from '@/injection-keys'
import { safeInject } from '@/safe-inject'
import { AuthError, ValidationError } from '@/errors'

const supabase: SupabaseClientType = safeInject(SUPABASE_CLIENT_KEY)
const logger: AbstractLogger = safeInject(LOGGER_KEY)
const router = useRouter()

const email = ref('')
const error = ref<string | undefined>()
const success = ref(false)
const isLoading = ref(false)

let isMounted = true

onBeforeUnmount(() => {
  isMounted = false
})

const sendPasswordResetEmail = async (
  emailAddress: string,
  supabaseClient: SupabaseClientType,
  origin: string
): Promise<Result<void, AuthError | ValidationError>> => {
  if (!emailAddress.trim()) {
    return err(new ValidationError('Please enter your email address'))
  }

  const { error: resetError } = await supabaseClient.auth.resetPasswordForEmail(emailAddress, {
    redirectTo: `${origin}/reset-password`,
  })

  if (resetError) {
    return err(new AuthError(resetError.message))
  }

  return ok(undefined)
}

const handleSendResetEmail = async () => {
  isLoading.value = true
  error.value = undefined
  success.value = false

  const origin = globalThis.location.origin
  const result = await sendPasswordResetEmail(email.value, supabase, origin)

  if (!isMounted) return

  result.match(
    () => {
      success.value = true
    },
    (resetError) => {
      error.value = resetError.message
      logger.error('Password reset email failed', {
        email: email.value,
        error: resetError,
      })
    }
  )

  isLoading.value = false
}
</script>
