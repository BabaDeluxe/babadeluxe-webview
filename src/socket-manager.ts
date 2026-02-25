import { err, ok, type Result, ResultAsync } from 'neverthrow'
import { io, type ManagerOptions, type Socket, type SocketOptions } from 'socket.io-client'
import type { Root } from '@babadeluxe/shared'
import type { AbstractLogger } from '@/logger'
import { SocketError } from '@/errors'
import { SocketFeatures } from '@/socket-features'

type SocketGetterName<K extends string> = `${Lowercase<K>}Socket`

type SocketGetters = {
  [K in keyof typeof SocketFeatures as SocketGetterName<K>]: SocketManager
}

class SocketManagerBase {
  private readonly _socket: Socket
  private _isConnectedInternal = false
  private _isConnectingInternal = false
  private readonly _trackedEvents = new Set<string>()
  private _internalHandlersRegistered = false

  constructor(
    private readonly _logger: AbstractLogger,
    private readonly _baseUrl: string,
    private readonly _authToken: string
  ) {
    const socketOptions: Partial<ManagerOptions & SocketOptions> = {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      autoConnect: false,
      auth: { token: this._authToken },
    }

    this._socket = io(this._baseUrl, socketOptions)
    this._createSocketGetters()
  }

  private _createSocketGetters(): void {
    for (const key of Object.keys(SocketFeatures)) {
      const getterName = `${key.toLowerCase()}Socket` as SocketGetterName<string>

      Object.defineProperty(this, getterName, {
        get: () => this,
        enumerable: true,
        configurable: false,
      })
    }
  }

  get isConnected(): boolean {
    return this._isConnectedInternal
  }

  async init(): Promise<Result<void, SocketError>> {
    if (this._isConnectedInternal) return ok(undefined)

    if (this._isConnectingInternal) {
      return err(new SocketError('Connection already in progress'))
    }

    this._logger.log(`Connecting to socket at ${this._baseUrl}`)
    this._isConnectingInternal = true

    if (!this._internalHandlersRegistered) {
      this._registerInternalHandlers()
      this._internalHandlersRegistered = true
    }

    const result = await this._performConnection(10_000)
    this._isConnectingInternal = false

    if (result.isErr()) {
      this._logger.error('Socket failed to connect', {
        baseUrl: this._baseUrl,
        error: result.error,
      })
    }

    return result.map(() => undefined)
  }

  private _registerInternalHandlers(): void {
    this._socket.on('connect', () => {
      this._isConnectedInternal = true
      this._logger.log(`Connected to socket: ${this._socket.id}`)
    })

    this._socket.on('disconnect', (reason: string) => {
      this._isConnectedInternal = false
      this._logger.log(`Socket disconnected: ${reason}`)
    })

    this._socket.on('connect_error', (unknownError: unknown) => {
      const error =
        unknownError instanceof Error ? unknownError : new SocketError('Socket connect error')

      this._logger.warn('Socket connection attempt failed, retrying', {
        baseUrl: this._baseUrl,
        error,
      })
    })

    this._trackedEvents.add('connect')
    this._trackedEvents.add('disconnect')
    this._trackedEvents.add('connect_error')
  }

  private async _performConnection(
    timeoutMilliseconds: number
  ): Promise<Result<Socket, SocketError>> {
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
            new SocketError(`Connection timeout after ${timeoutMilliseconds}ms (retries exhausted)`)
          )
        }, timeoutMilliseconds)

        this._socket.connect()
      }),
      (unknownError) =>
        new SocketError(
          unknownError instanceof Error
            ? unknownError.message
            : 'Unknown socket connection failure',
          unknownError instanceof Error ? unknownError : undefined
        )
    )
  }

  async waitForConnection(timeoutMilliseconds = 10_000): Promise<Result<void, SocketError>> {
    if (this._isConnectedInternal) return ok(undefined)

    return ResultAsync.fromPromise(
      new Promise<void>((resolve, reject) => {
        const onConnect = () => {
          clearTimeout(timeoutId)
          resolve()
        }

        this._socket.once('connect', onConnect)

        const timeoutId = setTimeout(() => {
          this._socket.off('connect', onConnect)
          reject(new SocketError(`Connection timeout after ${timeoutMilliseconds}ms`))
        }, timeoutMilliseconds)
      }),
      (unknownError) =>
        new SocketError(
          unknownError instanceof Error ? unknownError.message : 'Socket connection timeout',
          unknownError instanceof Error ? unknownError : undefined
        )
    )
  }

  disconnect(): void {
    if (!this._isConnectedInternal) return

    for (const eventName of this._trackedEvents) {
      this._socket.off(eventName)
    }

    this._trackedEvents.clear()
    this._internalHandlersRegistered = false
    this._socket.disconnect()
    this._isConnectedInternal = false
    this._logger.log('Socket disconnected and listeners cleared')
  }

  // Typed events (from shared contract)
  on<T extends keyof Root.Emission>(event: T, handler: Root.Emission[T]): void
  // String events (for composables / internal app events)
  on(event: string, handler: (...args: unknown[]) => void): void
  on(event: string, handler: (...args: unknown[]) => void): void {
    const eventName = String(event)
    this._trackedEvents.add(eventName)
    this._socket.on(eventName, handler)
  }

  off<T extends keyof Root.Emission>(event: T, handler?: Root.Emission[T]): void
  off(event: string, handler?: (...args: unknown[]) => void): void
  off(event: string, handler?: (...args: unknown[]) => void): void {
    const eventName = String(event)

    if (handler !== undefined) {
      this._socket.off(eventName, handler)

      if (this._socket.listeners(eventName).length === 0) {
        this._trackedEvents.delete(eventName)
      }
      return
    }

    this._socket.off(eventName)
    this._trackedEvents.delete(eventName)
  }

  emit<T extends keyof Root.Actions>(
    eventId: T,
    ...args: Root.Actions[T] extends (...args: infer P) => unknown ? P : never
  ): Result<void, SocketError> {
    if (!this._isConnectedInternal) {
      const socketError = new SocketError('No socket connection established before emit')
      this._logger.error('Socket emit failed', {
        eventId: String(eventId),
        baseUrl: this._baseUrl,
        error: socketError,
      })
      return err(socketError)
    }

    this._logger.log(`[emit] Event: ${String(eventId)}`)
    this._socket.emit(String(eventId), ...args)
    return ok(undefined)
  }
}

// Interface merging for TypeScript awareness
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface SocketManager extends SocketGetters {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SocketManager extends SocketManagerBase {}
