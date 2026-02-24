/* eslint-disable @typescript-eslint/no-explicit-any */
import { ref } from 'vue'
import type { ComponentMountingOptions } from '@vue/test-utils'
import { SOCKET_MANAGER_KEY } from '@/injection-keys'

type EventHandler = (...args: any[]) => void

export class MockSocket {
  private _handlers = new Map<string, EventHandler[]>()
  public isConnected = true

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
    event: string,
    payload?: any,
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

export function createMockSocketManager(
  sockets: {
    chatSocket?: MockSocket
    settingsSocket?: MockSocket
    subscriptionSocket?: MockSocket
  } = {}
) {
  const socketManager = {
    chatSocket: sockets.chatSocket ?? new MockSocket(),
    settingsSocket: sockets.settingsSocket ?? new MockSocket(),
    subscriptionSocket: sockets.subscriptionSocket ?? new MockSocket(),
  }

  return {
    socketManager,
    socketManagerRef: ref(socketManager),
    provide: {
      [SOCKET_MANAGER_KEY as symbol]: ref(socketManager),
      // @ts-ignore
    } as ComponentMountingOptions<any>['global']['provide'],
  }
}

export function trigger(socket: MockSocket, event: string, payload?: any): void {
  socket.trigger(event, payload)
}
