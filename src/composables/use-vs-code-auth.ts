import { Result, ResultAsync, ok, err } from 'neverthrow'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCurrentScope, onScopeDispose, ref } from 'vue'
import { AuthError, NetworkError } from '@/errors'
import { useTrackedTimeouts } from '@/composables/use-tracked-timeouts'
import { getVsCodeApi } from '@/vs-code/api'
import { VsCodeAuthGateway, type AuthSessionPayload } from '@/services/vs-code-auth-gateway'
import { socketTimeoutMs } from '@/constants'
import { incomingAuthMessageSchema } from '@/vs-code/types'
import { isOfflineMode } from '@/env-validator'

const isRequestPending = ref(false)

export function useVsCodeAuth() {
  const { createTimeout, cancelTimeout } = useTrackedTimeouts()
  const gateway = VsCodeAuthGateway.getInstance()

  const isRunningInsideVsCode = (): boolean => getVsCodeApi().isOk()

  const requestGitHubLoginFromExtension = (timeoutMs = socketTimeoutMs.vsCodeAuthLogin) =>
    requestOAuthLoginFromExtension('github', timeoutMs)

  const getStoredSessionFromExtension = (timeoutMs?: number) => {
    if (isOfflineMode()) return Promise.resolve(ok(undefined))
    return gateway.getSession(createTimeout as any, cancelTimeout as any, timeoutMs)
  }

  const setSupabaseSession = async (
    supabaseClient: SupabaseClient,
    sessionPayload: AuthSessionPayload
  ): Promise<Result<void, AuthError>> => {
    if (isOfflineMode()) return ok(undefined)

    const setSessionResult = await ResultAsync.fromPromise(
      supabaseClient.auth.setSession({
        access_token: sessionPayload.accessToken,
        refresh_token: sessionPayload.refreshToken,
      }),
      (unknownError: unknown) => {
        if (unknownError instanceof Error) {
          return new AuthError(unknownError.message, unknownError)
        }

        return new AuthError('Failed to set Supabase session', unknownError)
      }
    )

    if (setSessionResult.isErr()) return err(setSessionResult.error)
    if (setSessionResult.value.error) {
      return err(new AuthError(setSessionResult.value.error.message))
    }

    return ok(undefined)
  }

  const clearStoredSession = (): Result<void, AuthError> => {
    if (!isRunningInsideVsCode() || isOfflineMode()) return ok(undefined)

    const apiResult = getVsCodeApi()
    if (apiResult.isErr()) return ok(undefined)
    if (!apiResult.value) return ok(undefined)

    return Result.fromThrowable(
      () => {
        apiResult.value.postMessage({
          type: 'clear-session',
          payload: {},
        })
      },
      (unknownError: unknown) => {
        if (unknownError instanceof Error) {
          return new AuthError(unknownError.message, unknownError)
        }

        return new AuthError('Failed to clear stored session', unknownError)
      }
    )()
  }

  const requestOAuthLoginFromExtension = async (
    provider: 'github' | 'google',
    timeoutMilliseconds = socketTimeoutMs.vsCodeAuthLogin
  ): Promise<Result<AuthSessionPayload | undefined, NetworkError | AuthError>> => {
    if (isOfflineMode()) return ok(undefined)

    if (isRequestPending.value) {
      return err(new NetworkError('Authentication request already in progress'))
    }

    isRequestPending.value = true

    const apiResult = getVsCodeApi()
    if (apiResult.isErr()) {
      isRequestPending.value = false
      return err(apiResult.error)
    }

    if (!apiResult.value) {
      isRequestPending.value = false
      return ok(undefined)
    }

    const vscodeApi = apiResult.value

    const waitForSession = new Promise<Result<AuthSessionPayload, NetworkError | AuthError>>(
      (resolve) => {
        let timeoutId: ReturnType<typeof setTimeout> | undefined

        const cleanup = () => {
          isRequestPending.value = false

          if (timeoutId) {
            cancelTimeout(timeoutId)
            timeoutId = undefined
          }

          window.removeEventListener('message', onMessage)
        }

        const onMessage = (event: MessageEvent) => {
          const parsedMessage = incomingAuthMessageSchema.safeParse(event.data)
          if (!parsedMessage.success) return

          const message = parsedMessage.data

          if (message.type === 'auth.error') {
            cleanup()
            resolve(err(new AuthError(message.message ?? 'VS Code sent auth error')))
            return
          }

          cleanup()
          resolve(
            ok({
              accessToken: message.session.accessToken,
              refreshToken: message.session.refreshToken,
              expiresAtUnixSeconds: message.session.expiresAtUnixSeconds,
            })
          )
        }

        timeoutId = createTimeout(() => {
          cleanup()
          resolve(err(new NetworkError('VS Code authentication timed out')))
        }, timeoutMilliseconds)

        if (getCurrentScope()) {
          onScopeDispose(cleanup)
        }

        window.addEventListener('message', onMessage)
        vscodeApi.postMessage({ type: 'auth.login', provider })
      }
    )

    return await waitForSession
  }

  return {
    isRunningInsideVsCode,
    requestGitHubLoginFromExtension,
    getStoredSessionFromExtension,
    setSupabaseSession,
    clearStoredSession,
    requestOAuthLoginFromExtension,
    isRequestPending,
  }
}
