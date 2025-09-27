<template>
  <section id="login">
    <div
      class="flex flex-col items-center justify-center w-full h-screen bg-slate text-deepText font-onest p-4"
    >
      <div class="flex flex-row justify-center items-center">
        <BabaDeluxeIcon class="flex flex-1" />
        <div class="flex flex-2 justify-center items-center">
          <h2 class="text-2xl font-bold text-accent">
            BabaDeluxe Login
          </h2>
        </div>
      </div>
      <div
        class="flex flex-col w-full max-w-md bg-panel rounded-lg shadow-lg p-6 my-4 border border-borderMuted"
      >
        <ButtonItem
          text="Login with GitHub"
          icon="i-simple-icons:github"
          @click="loginWithGitHub"
        />

        <div class="text-center text-subtleText my-4">
          or
        </div>

        <form
          @submit.prevent="handleAuth"
          class="flex flex-col gap-4"
        >
          <input
            v-model="email"
            type="email"
            placeholder="Email"
            class="bg-codeBg border border-borderMuted rounded py-2 px-3 text-deepText focus:outline-none focus:border-accent"
            required
          >
          <input
            v-model="password"
            type="password"
            placeholder="Password"
            class="bg-codeBg border border-borderMuted rounded py-2 px-3 text-deepText focus:outline-none focus:border-accent"
            required
          >
          <ButtonItem
            :text="isSignUp ? 'Sign Up' : 'Sign In'"
            :disabled="isLoading"
          />
          <ButtonItem
            :text="isSignUp ? 'Switch to Sign In' : 'Switch to Sign Up'"
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
import { inject, onMounted, ref } from "vue";
import BabaDeluxeIcon from "../components/BabaDeluxeIcon.vue";
import ButtonItem from "../components/ButtonItem.vue";
import router from "../routes";
import { IocEnum } from '@/enums/ioc-enum';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabase: SupabaseClient<any, "public", "public", any, any> = inject(IocEnum.SUPABASE_CLIENT)!
if (!supabase) throw new Error('Failed to inject the supabase client into the socket service')

const email = ref("");
const password = ref("");
const isSignUp = ref(false);
const error = ref<string | null>(null);
const isLoading = ref(false);

const toggleMode = () => {
  isSignUp.value = !isSignUp.value;
  error.value = null;
};

const handleAuth = async () => {
  isLoading.value = true;
  error.value = null;
  try {
    let result;
    if (isSignUp.value) {
      result = await supabase.auth.signUp({
        email: email.value,
        password: password.value,
      });
    } else {
      result = await supabase.auth.signInWithPassword({
        email: email.value,
        password: password.value,
      });
    }
    if (result.error) throw result.error;
    // Handle successful auth (e.g., redirect or emit event)
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    isLoading.value = false;
  }
};

const loginWithGitHub = async () => {
  const { error } = await supabase.auth.signInWithOAuth({ provider: "github" });
  if (error) console.trace(error);
  // OAuth flow handles redirect
};

onMounted(() => {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session) {
      router.push("/chat");
    }
  });
});
</script>
