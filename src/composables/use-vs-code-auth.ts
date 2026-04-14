import { Result, ResultAsync, ok, err } from 'neverthrow'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AuthError } from '@/errors'
import { useTrackedTimeouts } from '@/composables/use-tracked-timeouts'
import { getVsCodeApi } from '@/vs-code/api'
import { VsCodeAuthGateway, type AuthSessionPayload } from '@/services/vs-code-auth-gateway'

export function useVsCodeAuth() {
  const { createTimeout, cancelTimeout } = useTrackedTimeouts()
  const gateway = VsCodeAuthGateway.getInstance()

  const isRunningInsideVsCode = (): boolean => getVsCodeApi().isOk()

  const requestGitHubLoginFromExtension = (timeoutMs?: number) =>
    gateway.requestLogin(createTimeout as any, cancelTimeout as any, timeoutMs)

  const getStoredSessionFromExtension = (timeoutMs?: number) =>
    gateway.getSession(createTimeout as any, cancelTimeout as any, timeoutMs)

  const setSupabaseSession = async (
    supabaseClient: SupabaseClient,
    sessionPayload: AuthSessionPayload
  ): Promise<Result<void, AuthError>> => {
    const setSessionResult = await ResultAsync.fromPromise(
      supabaseClient.auth.setSession({
        // eslint-disable-next-line @typescript-eslint/naming-convention
        access_token: sessionPayload.accessToken,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        refresh_token: sessionPayload.refreshToken,
      }),
      (unknownError: unknown) => {
        if (unknownError instanceof Error) {
          return new AuthError(unknownError.message, unknownError)
        }
        return new AuthError('Failed to set Supabase session')
      }
    )

    if (setSessionResult.isErr()) return err(setSessionResult.error)
    if (setSessionResult.value.error) {
      return err(new AuthError(setSessionResult.value.error.message))
    }

    return ok(undefined)
  }

  const clearStoredSession = (): Result<void, AuthError> => {
    if (!isRunningInsideVsCode()) return ok(undefined)

    const vsCodeApi = getVsCodeApi()
    if (vsCodeApi.isErr()) return ok(undefined)

    const result = Result.fromThrowable(
      () => {
        vsCodeApi.value.postMessage({
          type: 'clear-session',
          payload: {},
        })
      },
      (unknownError) => {
        if (unknownError instanceof Error) {
          return new AuthError(unknownError.message, unknownError)
        }
        return new AuthError('Failed to clear stored session', unknownError)
      }
    )()

    return result
  }

  return {
    isRunningInsideVsCode,
    requestGitHubLoginFromExtension,
    getStoredSessionFromExtension,
    setSupabaseSession,
    clearStoredSession,
  }
}
