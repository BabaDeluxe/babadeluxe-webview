import { getVsCodeApi } from '@/vs-code/api'
import { logger } from '@/logger'
import type { Result } from 'neverthrow'
import { err, ok } from 'neverthrow'
import { NetworkError } from '@/errors'
import { socketTimeoutMs } from '@/constants'
import type { AutoContextRequest, FileContextResolveRequest } from '@/vs-code/types'

type PendingResolver = (result: Result<unknown[], NetworkError>) => void

export class VsCodeBridge {
  private static _instance: VsCodeBridge
  private readonly _pending = new Map<string, PendingResolver>()

  private constructor() {
    window.addEventListener('message', this._handleMessage.bind(this))
  }

  static getInstance(): VsCodeBridge {
    if (!this._instance) {
      this._instance = new VsCodeBridge()
    }
    return this._instance
  }

  post(message: object): void {
    const apiResult = getVsCodeApi()
    if (apiResult.isErr()) {
      logger.warn('Cannot post message to VS Code', {
        messageType: (message as { type?: string }).type,
        error: apiResult.error,
      })
      return
    }
    apiResult.value.postMessage(message)
  }

  async postAndAwait(
    request: AutoContextRequest | FileContextResolveRequest,
    createTimeout: (cb: () => void, ms: number) => NodeJS.Timeout,
    cancelTimeout: (id: NodeJS.Timeout) => void,
    timeoutMs: number = socketTimeoutMs.vsCodeContext
  ): Promise<Result<unknown[], NetworkError>> {
    const apiResult = getVsCodeApi()
    if (apiResult.isErr()) return err(apiResult.error)

    const vsCodeApi = apiResult.value
    const requestId = request.requestId
    const requestType = request.type

    return await new Promise<Result<unknown[], NetworkError>>((resolve) => {
      let didFinish = false

      const finish = (result: Result<unknown[], NetworkError>) => {
        if (didFinish) return
        didFinish = true
        this._pending.delete(requestId)
        resolve(result)
      }

      const timeoutId = createTimeout(() => {
        finish(
          err(
            new NetworkError(
              `VS Code context request timed out after ${timeoutMs}ms: ${requestType} (${requestId})`
            )
          )
        )
      }, timeoutMs)

      this._pending.set(requestId, (result) => {
        cancelTimeout(timeoutId)
        finish(result)
      })

      vsCodeApi.postMessage(request)
    })
  }

  private _handleMessage(event: MessageEvent): void {
    const message = event.data
    if (!message || typeof message !== 'object' || !('requestId' in message)) return

    const resolve = this._pending.get(message.requestId)
    if (!resolve) return

    this._pending.delete(message.requestId)

    if ('error' in message && typeof message.error === 'string' && message.error.length > 0) {
      resolve(err(new NetworkError(message.error)))
      return
    }

    resolve(ok((message as { items?: unknown[] }).items ?? []))
  }
}
