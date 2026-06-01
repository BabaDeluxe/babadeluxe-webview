import { ref } from 'vue'
import { ResultAsync } from 'neverthrow'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AuthError } from '@/errors'
import type { AbstractLogger } from '@/logger'
import { isOfflineMode } from '@/env-validator'

export function useChatUser(supabase: SupabaseClient, logger: AbstractLogger) {
  const currentUsername = ref('User')
  const currentUserId = ref<string>()

  const fetchUsername = async (): Promise<void> => {
    if (isOfflineMode()) {
      currentUserId.value = 'offline-user'
      currentUsername.value = 'Local User'
      return
    }

    const getUserResult = await ResultAsync.fromPromise(supabase.auth.getUser(), (unknownError) =>
      unknownError instanceof Error
        ? new AuthError(unknownError.message, unknownError)
        : new AuthError('Failed to fetch user', unknownError)
    )

    getUserResult.match(
      (response) => {
        const user = response.data.user
        if (user?.id) currentUserId.value = user.id

        const githubIdentity = user?.identities?.find((id) => id.provider === 'github')
        if (githubIdentity?.identity_data?.login) {
          currentUsername.value = githubIdentity.identity_data.login as string
        } else if (user?.user_metadata?.username) {
          currentUsername.value = user.user_metadata.username as string
        }
      },
      (fetchError) => {
        logger.error('Failed to fetch user details', {
          error: fetchError,
        })
      }
    )
  }

  return {
    currentUsername,
    currentUserId,
    fetchUsername,
  }
}
