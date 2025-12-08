import { err, ok, type Result } from 'neverthrow'
import type { ManagerOptions, Socket, SocketOptions } from 'socket.io-client'
import { io } from 'socket.io-client'
import type { ConsoleLogger } from '@simwai/utils'
import { SocketService } from './socket-service'
import type { SocketConnectionError } from './errors'
import { SocketManagerError } from './errors'
import type { BaseError } from './base-error'
import type { NamespaceName, SocketRegistry, SocketServiceFor } from './types/socket-manager-types'
import { SocketNamespace } from './socket-namespaces'

type SocketGetterName<K extends string> = `${Lowercase<K>}Socket`

type SocketGetters = {
  [K in keyof typeof SocketNamespace as SocketGetterName<K>]: SocketServiceFor<
    (typeof SocketNamespace)[K]
  >
}

class SocketManagerBase {
  private readonly _sockets: SocketRegistry

  constructor(
    private readonly _logger: ConsoleLogger,
    private readonly _baseUrl: string,
    private readonly _authToken: string
  ) {
    const ioOptions: Partial<ManagerOptions & SocketOptions> = {
      transports: ['websocket'],
      withCredentials: true,
      autoConnect: false,
      auth: { token: this._authToken },
    }

    this._sockets = {} as SocketRegistry

    for (const namespace of Object.values(SocketNamespace)) {
      this._sockets[namespace] = new SocketService(
        _logger,
        io(`${_baseUrl}/${namespace}`, ioOptions),
        namespace
      ) as SocketServiceFor<typeof namespace>
    }

    this._createSocketGetters()
  }

  private _createSocketGetters(): void {
    for (const [key, value] of Object.entries(SocketNamespace)) {
      const getterName = `${key.toLowerCase()}Socket` as SocketGetterName<typeof key>

      Object.defineProperty(this, getterName, {
        get: () => this._sockets[value],
        enumerable: true,
        configurable: false,
      })
    }
  }

  async init(): Promise<Result<void, SocketManagerError>> {
    this._logger.log(`🔌 Connecting to socket namespaces at ${this._baseUrl}`)

    const namespaces = Object.values(SocketNamespace)
    const settledResults = await Promise.allSettled(
      namespaces.map((namespace) => this._sockets[namespace].connect())
    )

    const failures: Array<{ namespace: string; error: BaseError }> = []

    for (const [index, settledResult] of settledResults.entries()) {
      const namespace = namespaces[index]

      if (settledResult.status === 'rejected') {
        this._logger.error(`${namespace} socket init() promise was rejected:`, settledResult.reason)
        failures.push({
          namespace,
          error: new SocketManagerError(
            `Unhandled exception during init`,
            settledResult.reason instanceof Error
              ? settledResult.reason
              : new Error(String(settledResult.reason))
          ),
        })
        continue
      }

      const initResult: Result<Socket, SocketConnectionError> = settledResult.value

      if (initResult.isErr()) {
        this._logger.error(`${namespace} socket failed to connect:`, initResult.error)
        failures.push({ namespace, error: initResult.error })
      }
    }

    if (failures.length > 0) {
      const errorDetails = failures.map((f) => `${f.namespace}: "${f.error.message}"`).join('; ')

      return err(
        new SocketManagerError(`Failed to connect to the following socket(s): ${errorDetails}`)
      )
    }

    return ok()
  }

  disconnect(): void {
    for (const namespace of Object.values(SocketNamespace)) {
      this._sockets[namespace].disconnect()
    }

    this._logger.log('🧹 All socket namespaces disconnected')
  }

  getSocket<N extends NamespaceName>(namespace: N): SocketServiceFor<N> {
    return this._sockets[namespace]
  }
}

// Dynamic getters (chatSocket, promptsSocket, etc.) are created at runtime
// via Object.defineProperty in the constructor loop. We use interface merging
// to expose them in the type system without duplicating the logic.

// Interface merging: adds socket getters to the type
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface SocketManager extends SocketGetters {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SocketManager extends SocketManagerBase {}
