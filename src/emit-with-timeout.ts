import type { Ref } from 'vue'
import { type Result, ResultAsync } from 'neverthrow'
import type { Root } from '@babadeluxe/shared/generated-socket-types'
import { socketTimeoutMs } from '@/constants'
import { SocketError } from '@/errors'

type ActionResponse<K extends keyof Root.Actions> = Root.Actions[K] extends (
  ...args: unknown[]
) => void
  ? // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Parameters<Root.Actions[K]> extends [infer _Payload, infer Callback]
    ? Callback extends (res: infer R) => void
      ? R
      : never
    : Parameters<Root.Actions[K]> extends [infer Callback]
      ? Callback extends (res: infer R) => void
        ? R
        : never
      : never
  : never

type SuccessData<K extends keyof Root.Actions> =
  ActionResponse<K> extends {
    success: true
    data: infer D
  }
    ? D
    : never

export type BaseResponse = {
  success: boolean
  data?: unknown
  error?: string
}

export async function emitWithTimeout<K extends keyof Root.Actions>({
  socket,
  actionName,
  payload,
  timeoutMs,
}: {
  socket: Ref<Root.Socket>
  actionName: K
  payload?: Parameters<Root.Actions[K]>[0]
  timeoutMs?: number
}): Promise<Result<SuccessData<K>, Error | string>> {
  const socketInstance = socket.value
  const timeout: number | undefined = timeoutMs ?? socketTimeoutMs.emit

  const emitPromise = () =>
    new Promise<SuccessData<K>>((resolve, reject) => {
      socketInstance
        .timeout(timeout)
        .emit(
          actionName,
          ...(payload !== undefined ? [payload] : []),
          (error: unknown, response: unknown) => {
            if (error) reject(error)
            else {
              const res = response as BaseResponse
              if (res.success) resolve(res.data as SuccessData<K>)
              else reject(res.error || new SocketError('Unknown server error'))
            }
          }
        )
    })

  const result = await ResultAsync.fromThrowable(emitPromise, (error) =>
    error instanceof Error ? error : new SocketError('Socket.io uses Errors without Error as base.')
  )()

  return result
}
