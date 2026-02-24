<template>
  <div class="flex items-center justify-center shrink-0">
    <!-- User Avatar -->
    <img
      v-if="role === 'user' && avatarUrl"
      :src="avatarUrl"
      alt="User Avatar"
      class="w-14 h-14 object-cover rounded-full"
      loading="lazy"
    />

    <!-- User Placeholder -->
    <div
      v-else-if="role === 'user'"
      class="w-14 h-14 flex items-center justify-center text-subtleText rounded-full"
    >
      <i class="i-bi:person-circle w-8 h-8" />
    </div>

    <!-- Assistant Robot -->
    <div
      v-else
      class="w-14 h-14 flex items-center justify-center text-accent"
    >
      <IconRobot />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { EnvConfigType } from '@/env-validator'
import { ENV_CONFIG_KEY } from '@/injection-keys'
import IconRobot from '@/components/IconRobot.vue'
import { useUserAvatar } from '@/composables/use-user-avatar'
import { safeInject } from '@/safe-inject'

const envConfig: EnvConfigType = safeInject(ENV_CONFIG_KEY)
const projectRef = new URL(envConfig.VITE_SUPABASE_URL).hostname.split('.')[0]

defineProps<{
  role?: 'user' | 'assistant'
}>()

const { avatarUrl } = useUserAvatar(projectRef)
</script>
