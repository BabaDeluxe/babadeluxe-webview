import { err, ok, type Result } from 'neverthrow'
import type { ManagerOptions, SocketOptions } from 'socket.io-client'
import { io } from 'socket.io-client'
import type { ConsoleLogger } from '@simwai/utils'
import { SocketService } from './socket-service'
import { SocketConnectionError } from './errors'
import type { Root } from '@babadeluxe/shared'
import { SocketFeatures } from './socket-features'

// Dynamic getters
type SocketGetterName<K extends string> = `${Lowercase<K>}Socket`

type SocketGetters = {
  [K in keyof typeof SocketFeatures as SocketGetterName<K>]: SocketService<
    Root.Emission,
    Root.Actions
  >
}

class SocketManagerBase {
  private readonly _socket: SocketService<Root.Emission, Root.Actions>

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

    // Single connection to default namespace
    this._socket = new SocketService(_logger, io(_baseUrl, ioOptions))

    this._createSocketGetters()
  }

  private _createSocketGetters(): void {
    for (const key of Object.keys(SocketFeatures)) {
      const getterName = `${key.toLowerCase()}Socket` as SocketGetterName<typeof key>

      Object.defineProperty(this, getterName, {
        get: () => this._socket, // All return same socket
        enumerable: true,
        configurable: false,
      })
    }
  }

  async init(): Promise<Result<void, SocketConnectionError>> {
    this._logger.log(`🔌 Connecting to socket at ${this._baseUrl}`)

    const initResult = await this._socket.connect()

    if (initResult.isErr()) {
      this._logger.error(`Socket failed to connect:`, initResult.error)
      return err(
        new SocketConnectionError(`Failed to connect to socket: ${initResult.error.message}`)
      )
    }

    return ok()
  }

  disconnect(): void {
    this._socket.disconnect()
    this._logger.log('🧹 Socket disconnected')
  }

  getSocket() {
    return this._socket
  }
}

// Interface merging for TypeScript awareness
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface SocketManager extends SocketGetters {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SocketManager extends SocketManagerBase {}
