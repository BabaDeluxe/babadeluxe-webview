<template>
  <section id="password-reset">
      <div class="flex flex-col items-center justify-center w-full h-full bg-slate text-deepText font-onest p-4">
      <div class="flex flex-col w-full max-w-md bg-panel rounded-lg shadow-lg p-6 my-4 border border-borderMuted">
        <h2 class="text-2xl font-bold text-accent mb-4">Forgot Password</h2>
        <p class="text-subtleText mb-4">Enter your email address and we'll send you a reset link.</p>

        <form @submit.prevent="handleSendResetEmail" class="flex flex-col gap-4">
          <input
            v-model="email"
            type="email"
            placeholder="Email"
            class="bg-codeBg border border-borderMuted rounded py-2 px-3 text-deepText focus:outline-none focus:border-accent"
            required
            aria-label="Email Address"
            autocomplete="email"
          />

          <ButtonItem
            aria-label="Send Reset Link"
            type="submit"
            text="Send Reset Link"
            :disabled="isLoading || !email"
          />

          <ButtonItem
            aria-label="Back to Login"
            type="button"
            text="Back to Login"
            :disabled="isLoading"
            @click="router.push('/login')"
          />
        </form>

        <p v-if="error" aria-label="Password Reset Error" class="text-error mt-4">{{ error }}</p>
        <p v-if="success" aria-label="Password Reset Success" class="text-accent mt-4">
          Reset link sent! Check your email inbox.
        </p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { inject, ref } from 'vue'
import { useRouter } from 'vue-router'
import ButtonItem from '../components/ButtonItem.vue'
import { IocEnum } from '@/enums/ioc-enum'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConsoleLogger } from '@simwai/utils'

const supabase: SupabaseClient = inject(IocEnum.SUPABASE_CLIENT)!
const logger: ConsoleLogger = inject(IocEnum.LOGGER)!
const router = useRouter()

const email = ref('')
const error = ref<string | null>(null)
const success = ref(false)
const isLoading = ref(false)

const handleSendResetEmail = async () => {
  if (!email.value) {
    error.value = 'Please enter your email address'
    return
  }

  isLoading.value = true
  error.value = null
  success.value = false

  try {
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.value,
      { redirectTo: `${window.location.origin}/reset-password` }
    )

    if (resetError) throw resetError

    success.value = true
  } catch (err: any) {
    error.value = err?.message ?? String(err)
    logger.trace('Reset email failed:', err)
  } finally {
    isLoading.value = false
  }
}
</script>
