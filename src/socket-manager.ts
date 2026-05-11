import { type Result, err, ok, ResultAsync } from 'neverthrow'
import { type ManagerOptions, type SocketOptions, io } from 'socket.io-client'
import { Root } from '@babadeluxe/shared'
import type { AbstractLogger } from '@/logger'
import { SocketError } from '@/errors'

export class SocketManager {
  private readonly _socket: Root.Socket
  private _isConnectedInternal = false
  private _isConnectingInternal = false
  private readonly _trackedEvents = new Set<string>()
  private _internalHandlersRegistered = false

  // Named references so disconnect() can remove them specifically, not in bulk.
  private readonly _onConnect = (): void => {
    this._isConnectedInternal = true
    this._logger.log(`Connected to socket: ${this._socket.id}`)
  }

  private readonly _onDisconnect = (reason: string): void => {
    this._isConnectedInternal = false
    this._logger.log(`Socket disconnected: ${reason}`)
  }

  private readonly _onConnectError = (unknownError: unknown): void => {
    const error =
      unknownError instanceof Error ? unknownError : new SocketError('Socket connect error')

    this._logger.warn('Socket connection attempt failed, retrying', {
      baseUrl: this._baseUrl,
      error,
    })
  }

  // Shared promise used to coalesce concurrent waitForConnection callers.
  private _connectingPromise: Promise<Result<void, SocketError>> | undefined

  constructor(
    private readonly _logger: AbstractLogger,
    private readonly _baseUrl: string,
    private readonly _authToken: string
  ) {
    const socketOptions: Partial<ManagerOptions & SocketOptions> = {
      path: Root.path,
      transports: ['websocket', 'polling'],
      withCredentials: true,
      autoConnect: false,
      auth: { token: this._authToken },
    }

    this._socket = io(this._baseUrl, socketOptions)
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
    this._socket.on('connect', this._onConnect)
    this._socket.on('disconnect', this._onDisconnect)
    this._socket.on('connect_error', this._onConnectError)

    this._trackedEvents.add('connect')
    this._trackedEvents.add('disconnect')
    this._trackedEvents.add('connect_error')
  }

  private async _performConnection(
    timeoutMilliseconds: number
  ): Promise<Result<Root.Socket, SocketError>> {
    return ResultAsync.fromPromise(
      new Promise<Root.Socket>((resolve, reject) => {
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

  /**
   * Update authentication token for the socket connection.
   * This ensures that subsequent reconnections use a valid, fresh token.
   */
  updateAuthToken(token: string): void {
    this._socket.auth = { token }
  }

  async waitForConnection(timeoutMilliseconds = 10_000): Promise<Result<void, SocketError>> {
    if (this._isConnectedInternal) return ok(undefined)

    // Coalesce concurrent callers onto a single promise so only one timeout races.
    if (this._connectingPromise !== undefined) {
      return this._connectingPromise
    }

    this._connectingPromise = ResultAsync.fromPromise(
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
    ).finally(() => {
      this._connectingPromise = undefined
    })

    return this._connectingPromise
  }

  disconnect(): void {
    if (!this._isConnectedInternal) return

    // Remove internal handlers by reference to avoid disturbing app-registered handlers.
    this._socket.off('connect', this._onConnect)
    this._socket.off('disconnect', this._onDisconnect)
    this._socket.off('connect_error', this._onConnectError)

    this._trackedEvents.delete('connect')
    this._trackedEvents.delete('disconnect')
    this._trackedEvents.delete('connect_error')

    for (const eventName of this._trackedEvents) {
      this._socket.off(eventName)
    }

    this._trackedEvents.clear()
    this._internalHandlersRegistered = false
    this._isConnectedInternal = false
    this._socket.disconnect()
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
