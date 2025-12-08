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
import type { EnvConfigType } from '@/env-validator'
import type { Session } from '@supabase/supabase-js'
import type { ConsoleLogger } from '@simwai/utils'
import { ENV_CONFIG_KEY, LOGGER_KEY } from '@/injection-keys'
import RobotIcon from '@/components/RobotIcon.vue'
import { err, ok, Result } from 'neverthrow'
import { SessionParseError } from '@/errors'

const logger: ConsoleLogger = inject(LOGGER_KEY)!

const envConfig: EnvConfigType = inject(ENV_CONFIG_KEY)!
// eslint-disable-next-line @typescript-eslint/naming-convention
const { VITE_SUPABASE_URL } = envConfig
const projectRef = new URL(VITE_SUPABASE_URL).hostname.split('.')[0]

defineProps<{
  role?: 'user' | 'assistant'
}>()

const ttl = 5 * 60 * 1000
const cache = new Map<string, { url: string | undefined; timestamp: number }>()

const getSessionFromStorage = (): Result<Session | void, SessionParseError> => {
  const storageKey = `sb-${projectRef}-auth-token`
  const item = localStorage.getItem(storageKey)
  if (!item) return ok(undefined)

  const parseResult = Result.fromThrowable(
    () => JSON.parse(item) as Session,
    (error) => new SessionParseError('Failed to parse session from localStorage', error as Error)
  )()

  if (parseResult.isErr()) {
    logger.error('Session parse failed:', parseResult.error)
    return err(parseResult.error)
  }

  return ok(parseResult.value)
}

const avatarUrl = computed(() => {
  const now = Date.now()
  const cached = cache.get('avatar')

  if (cached && now - cached.timestamp < ttl) {
    return cached.url
  }

  const sessionResult = getSessionFromStorage()

  if (sessionResult.isErr()) {
    logger.warn('Avatar fetch failed. Now, placeholder is used.', String(sessionResult.error))
    return undefined
  }

  const url = sessionResult.value?.user?.identities?.[0]?.identity_data?.avatar_url

  cache.set('avatar', {
    url,
    timestamp: Date.now(),
  })

  return url
})
</script>
