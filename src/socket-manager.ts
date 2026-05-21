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

class SocketManagerBase {
  private _socketRef: Root.Socket
  private get _socket(): Root.Socket {
    return this._socketRef
  }

  private _isConnectedInternal = false
  private _isConnectingInternal = false
  private _isFallbackPending = false
  private _currentAuthToken: string
  private readonly _trackedEvents = new Set<string>()
  private _internalHandlersRegistered = false
  private _connectingPromise:
    | { promise: Promise<void>; reject: (e: SocketError) => void }
    | undefined
  private _fallbackErrorHandler: ((unknownError: unknown) => void) | undefined

  private readonly _onConnect = (): void => {
    this._isConnectedInternal = true
    this._removeFallbackErrorHandler()
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

  constructor(
    private readonly _logger: AbstractLogger,
    private readonly _baseUrl: string,
    private readonly _authToken: string
  ) {
    this._currentAuthToken = this._authToken

    const socketOptions: Partial<ManagerOptions & SocketOptions> = {
      path: Root.path,
      transports: ['websocket', 'polling'],
      withCredentials: true,
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 500,
      reconnectionDelayMax: 30_000,
      randomizationFactor: 0.5,
      auth: { token: this._currentAuthToken },
      parser: msgpackParser,
    }

    this._socketRef = io(this._baseUrl, socketOptions)
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

    if (this._isFallbackPending) {
      return err(new SocketError('Fallback connection in progress'))
    }

    this._logger.log(`Connecting to socket at ${this._baseUrl}`)
    this._isConnectingInternal = true

    if (!this._internalHandlersRegistered) {
      this._registerInternalHandlers()
      this._internalHandlersRegistered = true
    }

    this._registerFallbackErrorHandler()

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

  private _registerFallbackErrorHandler(): void {
    if (this._fallbackErrorHandler !== undefined) return

    const handler = (): void => {
      if (!this._socket.active && !this._isFallbackPending) {
        void this._mountFallbackSocket()
      }
    }

    this._fallbackErrorHandler = handler
    this._socket.on('connect_error', handler)
  }

  private _removeFallbackErrorHandler(): void {
    if (this._fallbackErrorHandler === undefined) return
    this._socket.off('connect_error', this._fallbackErrorHandler)
    this._fallbackErrorHandler = undefined
  }

  private async _mountFallbackSocket(): Promise<void> {
    this._isFallbackPending = true
    if (this._connectingPromise !== undefined) {
      const { reject } = this._connectingPromise
      this._connectingPromise = undefined
      reject(new SocketError('Socket replaced by no-parser fallback'))
    }

    this._logger.warn('msgpack socket exhausted retries — mounting no-parser fallback', {
      baseUrl: this._baseUrl,
    })
    this._socket.off('connect', this._onConnect)
    this._socket.off('disconnect', this._onDisconnect)
    this._socket.off('connect_error', this._onConnectError)
    this._removeFallbackErrorHandler()

    for (const eventName of this._trackedEvents) {
      this._socket.off(eventName)
    }

    this._trackedEvents.clear()
    this._socket.disconnect()
    this._isConnectedInternal = false
    this._isConnectingInternal = false
    this._internalHandlersRegistered = false
    const fallbackOptions: Partial<ManagerOptions & SocketOptions> = {
      path: Root.path,
      transports: ['websocket', 'polling'],
      withCredentials: true,
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 500,
      reconnectionDelayMax: 30_000,
      randomizationFactor: 0.5,
      auth: { token: this._currentAuthToken },
    }

    this._socketRef = io(this._baseUrl, fallbackOptions)

    this._isFallbackPending = false
    this._isConnectingInternal = true

    this._registerInternalHandlers()
    this._internalHandlersRegistered = true

    const result = await this._performConnection(10_000)
    this._isConnectingInternal = false

    if (result.isErr()) {
      this._logger.error('Fallback socket also failed to connect — giving up', {
        baseUrl: this._baseUrl,
        error: result.error,
      })
    } else {
      this._logger.log('Fallback no-parser socket connected successfully')
    }
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
    this._currentAuthToken = token
    this._socket.auth = { token }
  }

  async waitForConnection(timeoutMilliseconds = 10_000): Promise<Result<void, SocketError>> {
    if (this._isConnectedInternal) return ok(undefined)

    if (this._connectingPromise !== undefined) {
      try {
        await this._connectingPromise.promise
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

    let rejectHandle!: (e: SocketError) => void

    const promise = new Promise<void>((resolve, reject) => {
      rejectHandle = reject

      const onConnect = () => {
        clearTimeout(timeoutId)
        resolve()
      }

      this._socket.once('connect', onConnect)

      const timeoutId = setTimeout(() => {
        this._socket.off('connect', onConnect)
        reject(new SocketError(`Connection timeout after ${timeoutMilliseconds}ms`))
      }, timeoutMilliseconds)

      this._socket.connect()
    })

    this._connectingPromise = { promise, reject: rejectHandle }

    try {
      await promise
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
      if (this._connectingPromise?.promise === promise) {
        this._connectingPromise = undefined
      }
    }
  }

  disconnect(): void {
    this._removeFallbackErrorHandler()

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
    this._isFallbackPending = false
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

    this._logger.log(`Event: ${String(eventId)}`)
    this._socket.emit(String(eventId), ...args)
    return ok(undefined)
  }
}

export interface SocketManager extends SocketGetters {}
export class SocketManager extends SocketManagerBase {}
