import { err, ok, type Result, ResultAsync } from 'neverthrow'
import type { ManagerOptions, Socket, SocketOptions } from 'socket.io-client'
import { io } from 'socket.io-client'
import type { ConsoleLogger } from '@simwai/utils'
import { SocketConnectionError } from './errors'
import type { Root } from '@babadeluxe/shared'
import { SocketFeatures } from './socket-features'

// Dynamic getters
type SocketGetterName<K extends string> = `${Lowercase<K>}Socket`

type SocketGetters = {
  [K in keyof typeof SocketFeatures as SocketGetterName<K>]: SocketManager
}

class SocketManagerBase {
  private readonly _socket: Socket
  private _isConnected = false
  private _isConnecting = false
  private readonly _trackedEvents = new Set<string>()
  private _internalHandlersRegistered = false

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

    this._socket = io(_baseUrl, ioOptions)
    this._createSocketGetters()
  }

  private _createSocketGetters(): void {
    for (const key of Object.keys(SocketFeatures)) {
      const getterName = `${key.toLowerCase()}Socket` as SocketGetterName<typeof key>

      Object.defineProperty(this, getterName, {
        get: () => this, // Return self - all getters point to same manager
        enumerable: true,
        configurable: false,
      })
    }
  }

  get isConnected(): boolean {
    return this._isConnected
  }

  async init(): Promise<Result<void, SocketConnectionError>> {
    if (this._isConnected) return ok()

    if (this._isConnecting) {
      return err(new SocketConnectionError('Connection already in progress'))
    }

    this._logger.log(`🔌 Connecting to socket at ${this._baseUrl}`)
    this._isConnecting = true

    if (!this._internalHandlersRegistered) {
      this._registerInternalHandlers()
      this._internalHandlersRegistered = true
    }

    const result = await this._performConnection(10000)
    this._isConnecting = false

    if (result.isErr()) {
      this._logger.error('Socket failed to connect:', result.error)
    }

    return result.map(() => undefined)
  }

  private _registerInternalHandlers(): void {
    this._socket.on('connect', () => {
      this._isConnected = true
      this._logger.log(`Connected to socket: ${this._socket.id}`)
    })

    this._socket.on('disconnect', (reason: string) => {
      this._isConnected = false
      this._logger.log(`Socket disconnected: ${reason}`)
    })

    this._socket.on('connect_error', (error: unknown) => {
      this._logger.warn(
        'Socket connection attempt failed, retrying:',
        error instanceof Error ? error.message : 'Socket connect error'
      )
    })

    this._trackedEvents.add('connect')
    this._trackedEvents.add('disconnect')
    this._trackedEvents.add('connect_error')
  }

  private async _performConnection(
    timeoutMs: number
  ): Promise<Result<Socket, SocketConnectionError>> {
    return ResultAsync.fromPromise(
      new Promise<Socket>((resolve, reject) => {
        let hasResolved = false

        const connectHandler = () => {
          if (hasResolved) return
          hasResolved = true
          clearTimeout(timeoutId)
          resolve(this._socket)
        }

        this._socket.once('connect', connectHandler)

        const timeoutId = setTimeout(() => {
          if (hasResolved) return
          hasResolved = true
          this._socket.off('connect', connectHandler)
          reject(
            new SocketConnectionError(`Connection timeout after ${timeoutMs}ms (retries exhausted)`)
          )
        }, timeoutMs)

        this._socket.connect()
      }),
      (error) =>
        new SocketConnectionError(
          error instanceof Error ? error.message : 'Unknown socket connection failure',
          error instanceof Error ? error : undefined
        )
    )
  }

  async waitForConnection(timeoutMs = 10000): Promise<Result<void, SocketConnectionError>> {
    if (this._isConnected) return ok()

    return ResultAsync.fromPromise(
      new Promise<void>((resolve, reject) => {
        const onConnect = () => {
          clearTimeout(timeoutId)
          resolve()
        }

        this._socket.once('connect', onConnect)

        const timeoutId = setTimeout(() => {
          this._socket.off('connect', onConnect)
          reject(new SocketConnectionError(`Connection timeout after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
      (error) =>
        new SocketConnectionError(
          error instanceof Error ? error.message : 'Socket connection timeout',
          error instanceof Error ? error : undefined
        )
    )
  }

  disconnect(): void {
    if (!this._isConnected) return

    for (const eventName of this._trackedEvents) {
      this._socket.off(eventName)
    }

    this._trackedEvents.clear()
    this._internalHandlersRegistered = false
    this._socket.disconnect()
    this._isConnected = false
    this._logger.log('🧹 Socket disconnected')
  }

  on<T extends keyof Root.Emission>(event: T, handler: Root.Emission[T]): void {
    const eventString = String(event)
    this._trackedEvents.add(eventString)
    this._socket.on(eventString, handler as (...args: unknown[]) => void)
  }

  off<T extends keyof Root.Emission>(event: T, handler?: Root.Emission[T]): void {
    const eventString = String(event)

    if (handler !== undefined) {
      this._socket.off(eventString, handler as (...args: unknown[]) => void)

      if (this._socket.listeners(eventString).length === 0) {
        this._trackedEvents.delete(eventString)
      }
      return
    }

    this._socket.off(eventString)
    this._trackedEvents.delete(eventString)
  }

  emit<T extends keyof Root.Actions>(
    eventId: T,
    ...args: Root.Actions[T] extends (...args: infer P) => unknown ? P : never
  ): Result<void, SocketConnectionError> {
    if (!this._isConnected) {
      const socketConnectionError = new SocketConnectionError(
        'No socket connection established before emit'
      )
      this._logger.error('Socket emit failed', socketConnectionError)
      return err(socketConnectionError)
    }

    this._logger.log(`[emit] Event: ${String(eventId)}`)
    this._socket.emit(String(eventId), ...args)
    return ok()
  }
}

// Interface merging for TypeScript awareness
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface SocketManager extends SocketGetters {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SocketManager extends SocketManagerBase {}
