import { getVsCodeApi } from '@/vs-code/api'
import { NetworkError, AuthError } from '@/errors'
import { socketTimeoutMs } from '@/constants'
import { err, ok, type Result } from 'neverthrow'

export type AuthSessionPayload = Readonly<{
  accessToken: string
  refreshToken: string
  expiresAtUnixSeconds: number | undefined
}>

type IncomingMessage =
  | { type: 'auth.session'; session: AuthSessionPayload | undefined }
  | { type: 'auth.error'; message: string }

export class VsCodeAuthGateway {
  private static _instance: VsCodeAuthGateway
  private _isRequestPending = false

  private constructor() {}

  static getInstance(): VsCodeAuthGateway {
    if (!this._instance) {
      this._instance = new VsCodeAuthGateway()
    }
    return this._instance
  }

  async requestLogin(
    createTimeout: (cb: () => void, ms: number) => number,
    cancelTimeout: (id: number) => void,
    timeoutMs = socketTimeoutMs.vsCodeAuthLogin
  ): Promise<Result<AuthSessionPayload, NetworkError | AuthError>> {
    if (this._isRequestPending) {
      return err(new NetworkError('Authentication request already in progress'))
    }

    const apiResult = getVsCodeApi()
    if (apiResult.isErr()) return err(apiResult.error)
    const vsCodeApi = apiResult.value

    this._isRequestPending = true

    return new Promise((resolve) => {
      let timeoutId: number | undefined

      const cleanup = () => {
        this._isRequestPending = false
        if (timeoutId !== undefined) cancelTimeout(timeoutId)
        window.removeEventListener('message', onMessage)
      }

      const onMessage = (event: MessageEvent) => {
        const message = event.data as IncomingMessage
        if (message?.type === 'auth.error') {
          cleanup()
          resolve(err(new AuthError(message.message)))
        } else if (message?.type === 'auth.session' && message.session) {
          cleanup()
          resolve(ok(message.session))
        }
      }

      timeoutId = createTimeout(() => {
        cleanup()
        resolve(err(new NetworkError('VS Code authentication timed out')))
      }, timeoutMs)

      window.addEventListener('message', onMessage)
      vsCodeApi.postMessage({ type: 'auth.login' })
    })
  }

  async getSession(
    createTimeout: (cb: () => void, ms: number) => number,
    cancelTimeout: (id: number) => void,
    timeoutMs = socketTimeoutMs.vsCodeAuthSession
  ): Promise<Result<AuthSessionPayload | undefined, NetworkError>> {
    const apiResult = getVsCodeApi()
    if (apiResult.isErr()) return ok(undefined)
    const vsCodeApi = apiResult.value

    return new Promise((resolve) => {
      let timeoutId: number | undefined

      const cleanup = () => {
        if (timeoutId !== undefined) cancelTimeout(timeoutId)
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
      }, timeoutMs)

      window.addEventListener('message', onMessage)
      vsCodeApi.postMessage({ type: 'auth.getSession' })
    })
  }
}
