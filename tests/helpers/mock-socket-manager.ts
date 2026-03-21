/* eslint-disable @typescript-eslint/no-explicit-any */
import { nextTick, ref } from 'vue'
import { SOCKET_MANAGER_KEY } from '@/injection-keys'
import type { BaseResponse } from '@/emit-with-timeout'
import type { GlobalMountOptions } from 'node_modules/@vue/test-utils/dist/types'

type EventHandler = (...args: any[]) => void

export class MockSocket {
  private _handlers = new Map<string, EventHandler[]>()
  public isConnected = true

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  timeout(_ms: number) {
    return {
      emit: (event: string, ...args: any[]): { isOk: () => boolean; isErr: () => boolean } => {
        const callback = args[args.length - 1] as (error: unknown, response: BaseResponse) => void
        const response: BaseResponse = { success: true }

        setTimeout(() => {
          callback(null, response)
        }, 0)

        return {
          isOk: () => true,
          isErr: () => false,
        }
      },
    }
  }

  on(event: string, handler: EventHandler): void {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, [])
    }
    this._handlers.get(event)!.push(handler)
  }

  off(event: string, handler: EventHandler): void {
    const handlers = this._handlers.get(event)
    if (!handlers) return
    const index = handlers.indexOf(handler)
    if (index !== -1) handlers.splice(index, 1)
  }

  emit(
    _event: string,
    _payload?: any,
    callback?: (response: any) => void
  ): { isOk: () => boolean; isErr: () => boolean } {
    if (callback) {
      setTimeout(() => {
        callback({ success: true })
      }, 0)
    }
    return {
      isOk: () => true,
      isErr: () => false,
    }
  }

  async waitForConnection(): Promise<{
    isOk: () => boolean
    isErr: () => boolean
    value: undefined
    error: undefined
  }> {
    return { isOk: () => true, isErr: () => false, value: undefined, error: undefined }
  }

  trigger(event: string, payload?: any): void {
    const handlers = this._handlers.get(event)
    if (!handlers) return
    for (const handler of handlers) {
      handler(payload)
    }
  }
}

export type MockChatSocket = MockSocket
export type MockSettingsSocket = MockSocket
export type MockSubscriptionSocket = MockSocket

export class MockSocketManager {
  public readonly chatSocket: MockChatSocket
  public readonly settingsSocket: MockSettingsSocket
  public readonly subscriptionSocket: MockSubscriptionSocket

  constructor(
    opts: {
      chatSocket?: MockChatSocket
      settingsSocket?: MockSettingsSocket
      subscriptionSocket?: MockSubscriptionSocket
    } = {}
  ) {
    this.chatSocket = opts.chatSocket ?? new MockSocket()
    this.settingsSocket = opts.settingsSocket ?? new MockSocket()
    this.subscriptionSocket = opts.subscriptionSocket ?? new MockSocket()
  }
}

export function createMockSocketManager(
  opts: {
    chatSocket?: MockChatSocket
    settingsSocket?: MockSettingsSocket
    subscriptionSocket?: MockSubscriptionSocket
  } = {}
) {
  const socketManager = new MockSocketManager(opts)

  const global: GlobalMountOptions = {
    provide: {
      [SOCKET_MANAGER_KEY as symbol]: ref(socketManager),
    },
  }

  return {
    socketManager,
    socketManagerRef: ref(socketManager),
    global,
  }
}

export async function trigger(socket: MockSocket, event: string, payload?: any): Promise<void> {
  socket.trigger(event, payload)
  await nextTick()
}
