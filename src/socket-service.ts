import type { ConsoleLogger } from '@simwai/utils'
import type { Socket } from 'socket.io-client'
import { type Result, ResultAsync, ok } from 'neverthrow'

export class SocketConnectionError extends Error {
  constructor(
    public readonly namespace: string,
    message: string,
    public readonly cause?: Error
  ) {
    super(`[${namespace}] ${message}`)
    this.name = 'SocketConnectionError'
    Object.setPrototypeOf(this, SocketConnectionError.prototype)
  }
}

export class SocketConnectionTimeoutError extends Error {
  constructor(
    public readonly namespace: string,
    public readonly timeoutMs: number
  ) {
    super(`[${namespace}] Connection timeout after ${timeoutMs}ms`)
    this.name = 'SocketConnectionTimeoutError'
    Object.setPrototypeOf(this, SocketConnectionTimeoutError.prototype)
  }
}

// No constraints - accept whatever zod-sockets generates
export class SocketService<TEmission, TActions> {
  private _isConnected = false
  private _eventHandlers = new Map<string, Set<(...args: unknown[]) => void>>()

  constructor(
    private readonly _logger: ConsoleLogger,
    private readonly _socket: Socket,
    private readonly _namespace: string
  ) {}

  get isConnected(): boolean {
    return this._isConnected && this._socket.connected
  }

  get socketId(): string | undefined {
    return this._socket.id
  }

  async init(): Promise<Result<Socket, SocketConnectionError>> {
    return ResultAsync.fromPromise(
      new Promise<Socket>((resolve, reject) => {
        let hasResolved = false

        this._socket.on('connect', () => {
          if (hasResolved) return
          hasResolved = true
          this._isConnected = true
          this._logger.log(`Connected to ${this._namespace}: ${this._socket.id}`)
          resolve(this._socket)
        })

        this._socket.on('disconnect', (reason: string) => {
          this._isConnected = false
          this._logger.log(`❌ ${this._namespace} disconnected: ${reason}`)
        })

        // 🔑 Only log errors, don't reject on them yet
        this._socket.on('connect_error', (error: Error) => {
          this._logger.warn(
            `${this._namespace} connection attempt failed, retrying:`,
            error.message
          )
        })

        // Timeout to prevent hanging forever
        const timeoutId = setTimeout(() => {
          if (!hasResolved) {
            hasResolved = true
            reject(
              new SocketConnectionError(
                this._namespace,
                'Connection timeout after 10s (retries exhausted)'
              )
            )
          }
        }, 10000)

        this._socket.once('disconnect', () => {
          if (!hasResolved) {
            clearTimeout(timeoutId)
          }
        })

        this._socket.connect()
      }),
      (error) => {
        if (error instanceof SocketConnectionError) return error
        return new SocketConnectionError(
          this._namespace,
          'Unknown connection failure',
          error instanceof Error ? error : undefined
        )
      }
    )
  }

  disconnect(): void {
    if (this._isConnected) {
      for (const [event, handlers] of this._eventHandlers) {
        for (const handler of handlers) {
          this._socket.off(event, handler)
        }
      }
      this._eventHandlers.clear()
      this._socket.disconnect()
      this._logger.log(`🧹 ${this._namespace} cleaned up`)
    }
  }

  async waitForConnection(timeoutMs = 10000): Promise<Result<void, SocketConnectionTimeoutError>> {
    if (this._isConnected) return ok(undefined)

    return ResultAsync.fromPromise(
      new Promise<void>((resolve, reject) => {
        const onConnect = () => {
          clearTimeout(timeoutId)
          resolve()
        }

        // 🔍 DEBUG: Log socket ID on connect
        this._logger.log(`Connected to ${this._namespace}: ${this._socket.id}`)
        console.log(`🔍 [${this._namespace}] Socket ID: ${this._socket.id}`)

        this._socket.once('connect', onConnect)

        const timeoutId = setTimeout(() => {
          this._socket.off('connect', onConnect)
          reject(new SocketConnectionTimeoutError(this._namespace, timeoutMs))
        }, timeoutMs)
      }),
      (error) => {
        if (error instanceof SocketConnectionTimeoutError) return error
        return new SocketConnectionTimeoutError(this._namespace, timeoutMs)
      }
    )
  }

  on<T extends keyof TEmission>(event: T, handler: TEmission[T]): void {
    const eventString = String(event)
    const eventHandler = handler as (...args: unknown[]) => void

    if (!this._eventHandlers.has(eventString)) {
      this._eventHandlers.set(eventString, new Set())
    }

    this._eventHandlers.get(eventString)!.add(eventHandler)
    this._socket.on(eventString, eventHandler)
  }

  off<T extends keyof TEmission>(event: T, handler?: TEmission[T]): void {
    const eventString = String(event)

    if (handler) {
      const eventHandler = handler as (...args: unknown[]) => void
      this._eventHandlers.get(eventString)?.delete(eventHandler)
      this._socket.off(eventString, eventHandler)
    } else {
      this._eventHandlers.delete(eventString)
      this._socket.off(eventString)
    }
  }

  emit<T extends keyof TActions>(
    eventId: T,
    ...args: TActions[T] extends (...args: infer P) => unknown ? P : never
  ): void {
    this._logger.log(`[${this._namespace}] [emit] Event: ${String(eventId)}`)
    this._socket.emit(String(eventId), ...args)
  }
}
