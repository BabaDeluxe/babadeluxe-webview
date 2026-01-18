import { computed, ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { ok, Result } from 'neverthrow'
import { SessionParseError } from '@/errors'

interface AvatarCache {
  url: string | undefined
  timestamp: number
}

const cache = ref<AvatarCache | undefined>(undefined)
const cacheTtlMs = 5 * 60 * 1000

function parseSessionFromStorage(
  projectRef: string
): Result<Session | undefined, SessionParseError> {
  const storageKey = `sb-${projectRef}-auth-token`
  const item = localStorage.getItem(storageKey)

  if (!item) return ok(undefined)

  return Result.fromThrowable(
    () => JSON.parse(item) as Session,
    (error) => new SessionParseError('Failed to parse session from localStorage', error as Error)
  )()
}

function extractAvatarUrl(session: Session | undefined): string | undefined {
  return session?.user?.identities?.[0]?.identity_data?.avatar_url
}

export function useUserAvatar(projectRef: string) {
  const avatarUrl = computed(() => {
    const now = Date.now()

    if (cache.value && now - cache.value.timestamp < cacheTtlMs) {
      return cache.value.url
    }

    const sessionResult = parseSessionFromStorage(projectRef)

    if (sessionResult.isErr()) {
      console.warn('Avatar fetch failed, using placeholder', String(sessionResult.error))
      return undefined
    }

    const url = extractAvatarUrl(sessionResult.value)
    cache.value = { url, timestamp: now }

    return url
  })

  return { avatarUrl }
}
