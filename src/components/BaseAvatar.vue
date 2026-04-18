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
import { envConfigKey, loggerKey } from '@/injection-keys'
import IconRobot from '@/components/IconRobot.vue'
import { useUserAvatar } from '@/composables/use-user-avatar'
import { safeInject } from '@/safe-inject'

const logger = safeInject(loggerKey)
const envConfig: EnvConfigType = safeInject(envConfigKey)
const supabaseUrl = envConfig.VITE_SUPABASE_URL ?? ''
const projectRef = supabaseUrl ? new URL(supabaseUrl).hostname.split('.')[0] : ''
if (!projectRef) {
  logger.warn('ProjectRef is unset in during base avatar component init')
}

defineProps<{
  role?: 'user' | 'assistant'
}>()

const avatarUrlRef = useUserAvatar(projectRef)?.avatarUrl
const avatarUrl = avatarUrlRef ? avatarUrlRef.value : undefined
</script>
