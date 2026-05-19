/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
/* eslint-disable @typescript-eslint/no-empty-object-type */
import { type Result, err, ok } from 'neverthrow'
import { type ManagerOptions, type SocketOptions, io } from 'socket.io-client'
import * as msgpackParser from 'socket.io-msgpack-parser'
import { Root } from '@babadeluxe/shared'
import type { AbstractLogger } from '@/logger'
import { SocketError } from '@/errors'
import { SocketFeatures } from '@/socket-features'

type SocketGetterName<K extends string> = `${Lowercase<K>}Socket`

type SocketGetters = {
  [K in keyof typeof SocketFeatures as SocketGetterName<K>]: SocketManager
}

// ---------------------------------------------------------------------------
// Reconnect config
// ---------------------------------------------------------------------------
const RECONNECT_INITIAL_DELAY_MS = 500
const RECONNECT_MAX_RETRIES = 3
const RECONNECT_MAX_DELAY_MS = 30_000

/**
 * Returns the next reconnect delay in milliseconds using full-jitter
 * exponential backoff: delay = random(0, min(maxDelay, initialDelay * 2^attempt))
 */
function getReconnectDelay(attempt: number): number {
  const cap = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_INITIAL_DELAY_MS * 2 ** attempt)
  return Math.floor(Math.random() * cap)
}

class SocketManagerBase {
  private readonly _socket: Root.Socket
  private _isConnectedInternal = false
  private _isConnectingInternal = false
  private readonly _trackedEvents = new Set<string>()
  private _internalHandlersRegistered = false
  private _connectingPromise: Promise<void> | undefined
  private _reconnectAttempts = 0
  private _reconnectTimer: ReturnType<typeof setTimeout> | undefined

  private readonly _onConnect = (): void => {
    this._isConnectedInternal = true
    this._reconnectAttempts = 0
    clearTimeout(this._reconnectTimer)
    this._logger.log(`Connected to socket: ${this._socket.id}`)
  }

  private readonly _onDisconnect = (reason: string): void => {
    this._isConnectedInternal = false
    this._logger.log(`Socket disconnected: ${reason}`)
    this._scheduleReconnect()
  }

  private readonly _onConnectError = (unknownError: unknown): void => {
    const error =
      unknownError instanceof Error ? unknownError : new SocketError('Socket connect error')

    this._logger.warn('Socket connection attempt failed, retrying', {
      baseUrl: this._baseUrl,
      error,
    })
  }

  // -------------------------------------------------------------------------
  // Exponential reconnect
  // -------------------------------------------------------------------------
  private _scheduleReconnect(): void {
    if (this._reconnectAttempts >= RECONNECT_MAX_RETRIES) {
      this._logger.warn(
        `Socket reconnect limit reached (${RECONNECT_MAX_RETRIES} attempts). Giving up.`
      )
      return
    }

    const delay = getReconnectDelay(this._reconnectAttempts)
    this._reconnectAttempts++

    this._logger.log(
      `Reconnect attempt ${this._reconnectAttempts}/${RECONNECT_MAX_RETRIES} in ${delay}ms`
    )

    this._reconnectTimer = setTimeout(() => {
      if (!this._isConnectedInternal) {
        this._socket.connect()
      }
    }, delay)
  }

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
      reconnection: false, // We manage reconnects manually above
      auth: { token: this._authToken },
      parser: msgpackParser,
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
    return await new Promise<Result<Root.Socket, SocketError>>((resolve) => {
      let hasResolved = false

      const succeed = () => {
        if (hasResolved) return
        hasResolved = true
        clearTimeout(timeoutId)
        resolve(ok(this._socket))
      }

      const fail = (error: SocketError) => {
        if (hasResolved) return
        hasResolved = true
        clearTimeout(timeoutId)
        this._socket.off('connect', connectHandler)
        resolve(err(error))
      }

      const connectHandler = () => {
        succeed()
      }

      this._socket.once('connect', connectHandler)

      const timeoutId = setTimeout(() => {
        fail(
          new SocketError(`Connection timeout after ${timeoutMilliseconds}ms (retries exhausted)`)
        )
      }, timeoutMilliseconds)

      this._socket.connect()
    })
  }

  updateAuthToken(token: string): void {
    this._socket.auth = { token }
  }

  async waitForConnection(timeoutMilliseconds = 10_000): Promise<Result<void, SocketError>> {
    if (this._isConnectedInternal) return ok(undefined)

    if (this._connectingPromise !== undefined) {
      try {
        await this._connectingPromise
        return this._isConnectedInternal
          ? ok(undefined)
          : err(new SocketError('Socket not connected after waitForConnection'))
      } catch (unknownError) {
        const error =
          unknownError instanceof SocketError
            ? unknownError
            : new SocketError(
                unknownError instanceof Error ? unknownError.message : 'Socket connection timeout',
                unknownError instanceof Error ? unknownError : undefined
              )
        return err(error)
      }
    }

    const connectingPromise = new Promise<void>((resolve, reject) => {
      const onConnect = () => {
        clearTimeout(timeoutId)
        resolve()
      }

      this._socket.once('connect', onConnect)

      const timeoutId = setTimeout(() => {
        this._socket.off('connect', onConnect)
        reject(new SocketError(`Connection timeout after ${timeoutMilliseconds}ms`))
      }, timeoutMilliseconds)

      // Optionally, ensure a connect attempt is actually made:
      this._socket.connect()
    })

    this._connectingPromise = connectingPromise

    try {
      await connectingPromise
      return this._isConnectedInternal
        ? ok(undefined)
        : err(new SocketError('Socket not connected after waitForConnection'))
    } catch (unknownError) {
      const error =
        unknownError instanceof SocketError
          ? unknownError
          : new SocketError(
              unknownError instanceof Error ? unknownError.message : 'Socket connection timeout',
              unknownError instanceof Error ? unknownError : undefined
            )
      return err(error)
    } finally {
      if (this._connectingPromise === connectingPromise) {
        this._connectingPromise = undefined
      }
    }
  }

  disconnect(): void {
    clearTimeout(this._reconnectTimer)
    this._reconnectAttempts = 0

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

  on<T extends keyof Root.Emission>(event: T, handler: Root.Emission[T]): void
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

export interface SocketManager extends SocketGetters {}
export class SocketManager extends SocketManagerBase {}
