import type { Socket } from 'socket.io-client'
import { type Result, ResultAsync, err, ok } from 'neverthrow'
import type { ConsoleLogger } from '@simwai/utils'
import { SocketConnectionError } from './errors'

export class SocketService<TEmission, TActions> {
  private _isConnected = false
  private _isConnecting = false
  private _trackedEvents = new Set<string>()
  private _internalHandlersRegistered = false

  constructor(
    private readonly _logger: ConsoleLogger,
    private readonly _socket: Socket,
    private readonly _namespace: string
  ) {}

  get isConnected(): boolean {
    return this._isConnected
  }

  async connect(timeoutMs = 10000): Promise<Result<Socket, SocketConnectionError>> {
    if (this._isConnected) return ok(this._socket)

    if (this._isConnecting) {
      return err(new SocketConnectionError(this._namespace, 'Connection already in progress'))
    }

    this._isConnecting = true

    if (!this._internalHandlersRegistered) {
      this._registerInternalHandlers()
      this._internalHandlersRegistered = true
    }

    const result = await this._performConnection(timeoutMs)

    this._isConnecting = false

    return result
  }

  private _registerInternalHandlers(): void {
    this._socket.on('connect', () => {
      this._isConnected = true
      this._logger.log(`Connected to ${this._namespace}: ${this._socket.id}`)
    })

    this._socket.on('disconnect', (reason: string) => {
      this._isConnected = false
      this._logger.log(`${this._namespace} disconnected: ${reason}`)
    })

    this._socket.on('connect_error', (error: unknown) => {
      this._logger.warn(
        `${this._namespace} connection attempt failed, retrying:`,
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
            new SocketConnectionError(
              this._namespace,
              `Connection timeout after ${timeoutMs}ms (retries exhausted)`
            )
          )
        }, timeoutMs)

        this._socket.connect()
      }),
      (error) => {
        return new SocketConnectionError(
          this._namespace,
          error instanceof Error ? error.message : 'Unknown connection failure',
          error instanceof Error ? error : undefined
        )
      }
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
          reject(
            new SocketConnectionError(this._namespace, `Connection timeout after ${timeoutMs}ms`)
          )
        }, timeoutMs)
      }),
      (error) => {
        return new SocketConnectionError(
          this._namespace,
          error instanceof Error ? error.message : 'Connection timeout',
          error instanceof Error ? error : undefined
        )
      }
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
    this._logger.log(`🧹 ${this._namespace} cleaned up`)
  }

  on<T extends keyof TEmission>(event: T, handler: TEmission[T]): void {
    const eventString = String(event)
    this._trackedEvents.add(eventString)
    this._socket.on(eventString, handler as (...args: unknown[]) => void)
  }

  off<T extends keyof TEmission>(event: T, handler?: TEmission[T]): void {
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

  emit<T extends keyof TActions>(
    eventId: T,
    ...args: TActions[T] extends (...args: infer P) => unknown ? P : never
  ): Result<void, SocketConnectionError> {
    if (!this._isConnected) {
      const socketConnectionError = new SocketConnectionError(
        this._namespace,
        'No socket connection established before emit'
      )
      this._logger.error('Socket emit failed', socketConnectionError)
      return err(socketConnectionError)
    }

    this._logger.log(`[${this._namespace}] [emit] Event: ${String(eventId)}`)
    this._socket.emit(String(eventId), ...args)
    return ok()
  }
}
