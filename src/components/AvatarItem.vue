<template>
  <div class="flex items-center justify-center">
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
      <RobotIcon />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import type { EnvConfig } from '@/env-validator'
import { ENV_CONFIG_KEY } from '@/injection-keys'
import RobotIcon from '@/components/RobotIcon.vue'

const envConfig: EnvConfig = inject(ENV_CONFIG_KEY)!
const { VITE_SUPABASE_URL } = envConfig
const projectRef = new URL(VITE_SUPABASE_URL).hostname.split('.')[0]

defineProps<{
  role?: 'user' | 'assistant'
}>()

const ttl = 5 * 60 * 1000
const cache = new Map<string, { url: string | undefined; timestamp: number }>()

const getSessionFromStorage = ():
  | { user: { identities?: Array<{ identity_data?: { avatar_url?: string } }> } }
  | undefined => {
  try {
    const storageKey = `sb-${projectRef}-auth-token`
    const item = localStorage.getItem(storageKey)
    if (!item) return undefined
    return JSON.parse(item)
  } catch (error) {
    console.error('Failed to parse session from localStorage:', error)
    return undefined
  }
}

const avatarUrl = computed(() => {
  const now = Date.now()
  const cached = cache.get('avatar')

  if (cached && now - cached.timestamp < ttl) {
    return cached.url
  }

  const session = getSessionFromStorage()
  const url = session?.user?.identities?.[0]?.identity_data?.avatar_url

  cache.set('avatar', {
    url,
    timestamp: Date.now(),
  })

  return url
})
</script>
