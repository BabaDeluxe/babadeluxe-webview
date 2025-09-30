import { type Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from '@babadeluxe/shared'
import type { ConsoleLogger } from '@simwai/utils'

type EventNames = keyof ServerToClientEvents
type EventHandler<T extends EventNames> = ServerToClientEvents[T]

export class SocketService {
  public readonly handlers = new Map<string, (...args: any[]) => void>()

  constructor(
    private readonly _logger: ConsoleLogger,
    private readonly _socket: Socket<ServerToClientEvents, ClientToServerEvents>
  ) {}

  async init() {
    this._socket.on('connect', () => {
      this._logger.log(`✅ Connected to Socket.IO server: ${this._socket?.id}`)
    })

    this._socket.on('disconnect', () => {
      this._logger.log(`❌ Socket.io server disconnected: ${this._socket?.id}`)
    })

    this._socket.onAny((event, ...args: any[]) => {
      const handler = this.handlers.get(event)
      if (!handler) {
        this._logger.trace('No handler for the incoming event registered')
        return
      }

      handler(...args)
    })

    this._socket.connect()
    return this._socket
  }

  disconnect() {
    this._socket.disconnect()
    this.handlers.clear()
  }

  on<T extends EventNames>(event: T, handler: EventHandler<T>, errorHandler?: (data: any) => void) {
    const exec = () => this.handlers.set(event as string, handler as any)

    if (errorHandler) {
      try {
        exec()
      } catch (error) {
        errorHandler(error)
      }
    } else {
      exec()
    }
  }

  emit<T extends keyof ClientToServerEvents>(
    eventId: T,
    ...args: Parameters<ClientToServerEvents[T]>
  ) {
    this._socket.emit(eventId, ...args)
  }
}
