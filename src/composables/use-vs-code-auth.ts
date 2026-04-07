import { getCurrentScope, onScopeDispose, ref } from 'vue'
import { err, ok, Result, ResultAsync } from 'neverthrow'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NetworkError, AuthError } from '@/errors'
import { useTrackedTimeouts } from '@/composables/use-tracked-timeouts'
import { getVsCodeApi } from '@/vs-code/api'
import { socketTimeoutMs } from '@/constants'
import { isOfflineMode } from '@/env-validator'

export type AuthSessionPayload = Readonly<{
  accessToken: string
  refreshToken: string
  expiresAtUnixSeconds: number | undefined
}>

type IncomingMessage =
  | { type: 'auth.session'; session: AuthSessionPayload | undefined }
  | { type: 'auth.error'; message: string }

/**
 * Composable for handling authentication with VS Code extension.
 *
 * Technical constraint: requestGitHubLoginFromExtension uses window.addEventListener
 * which means multiple simultaneous calls will interfere with each other.
 * The last registered listener wins. Consider serializing calls at the caller level
 * if concurrent authentication requests are possible.
 */
const isRequestPending = ref(false)

export function useVsCodeAuth() {
  const { createTimeout, cancelTimeout } = useTrackedTimeouts()

  const isRunningInsideVsCode = (): boolean => getVsCodeApi().isOk()

  const apiResult = getVsCodeApi()
  const vsCodeApi = apiResult.isOk() ? apiResult.value : undefined

  const requestGitHubLoginFromExtension = async (
    timeoutMilliseconds = socketTimeoutMs.vsCodeAuthLogin
  ): Promise<Result<AuthSessionPayload | undefined, NetworkError | AuthError>> => {
    if (isOfflineMode()) return ok(undefined)
    if (isRequestPending.value) {
      return err(new NetworkError('Authentication request already in progress'))
    }

    isRequestPending.value = true

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
          const message = event.data as IncomingMessage

          if (message?.type === 'auth.error') {
            cleanup()
            resolve(err(new AuthError(message.message)))
            return
          }

          if (message?.type === 'auth.session' && message.session) {
            cleanup()
            resolve(ok(message.session))
          }
        }

        timeoutId = createTimeout(() => {
          cleanup()
          resolve(err(new NetworkError('VS Code authentication timed out')))
        }, timeoutMilliseconds)

        if (getCurrentScope()) onScopeDispose(cleanup)

        window.addEventListener('message', onMessage)
        vscodeApi.postMessage({ type: 'auth.login' })
      }
    )

    return await waitForSession
  }

  const getStoredSessionFromExtension = async (
    timeoutMilliseconds = socketTimeoutMs.vsCodeAuthSession
  ): Promise<Result<AuthSessionPayload | undefined, NetworkError>> => {
    if (isOfflineMode()) return ok(undefined)
    const waitForSession = new Promise<Result<AuthSessionPayload | undefined, NetworkError>>(
      (resolve) => {
        let timeoutId: ReturnType<typeof setTimeout> | undefined

        const cleanup = () => {
          if (timeoutId) {
            cancelTimeout(timeoutId)
            timeoutId = undefined
          }
          window.removeEventListener('message', onMessage)
        }

        const onMessage = (event: MessageEvent) => {
          const message = event.data as IncomingMessage
          if (message?.type === 'auth.session') {
            cleanup()
            resolve(ok(message.session))
          }
        }

        timeoutId = createTimeout(() => {
          cleanup()
          resolve(err(new NetworkError('VS Code session retrieval timed out')))
        }, timeoutMilliseconds)

        if (getCurrentScope()) onScopeDispose(cleanup)

        window.addEventListener('message', onMessage)

        vsCodeApi?.postMessage({ type: 'auth.getSession' })
      }
    )

    return await waitForSession
  }

  const setSupabaseSession = async (
    supabaseClient: SupabaseClient,
    sessionPayload: AuthSessionPayload
  ): Promise<Result<void, AuthError>> => {
    if (isOfflineMode()) return ok(undefined)
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
    if (!isRunningInsideVsCode() || isOfflineMode()) return ok(undefined)

    const result = Result.fromThrowable(
      () => {
        vsCodeApi?.postMessage({
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
