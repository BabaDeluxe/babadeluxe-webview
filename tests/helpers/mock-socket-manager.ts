import { ref } from 'vue'
import { ok } from 'neverthrow'
import { vi } from 'vitest'

export class MockSocket {
  on = vi.fn()
  off = vi.fn()
  emit = vi.fn()
  once = vi.fn()
  connect = vi.fn()
  disconnect = vi.fn()
  waitForConnection = vi.fn().mockResolvedValue(ok(undefined))
  isConnected = true

  constructor(overrides: Record<string, unknown> = {}) {
    Object.assign(this, overrides)
  }
}

export type MockSettingsSocket = MockSocket

export function createMockSocketManager(overrides: Record<string, unknown> = {}) {
  const socket = new MockSocket(overrides)

  return {
    socketManagerRef: ref({
      chatSocket: socket,
      modelsSocket: socket,
      promptsSocket: socket,
      settingsSocket: socket,
      validationSocket: socket,
      subscriptionSocket: socket,
      disconnect: vi.fn(),
      init: vi.fn().mockResolvedValue(ok(undefined)),
    }),
    socket,
  }
}

export async function trigger(socket: MockSocket, event: string, payload: unknown): Promise<void> {
  const call = socket.on.mock.calls.find((c: unknown[]) => c[0] === event)
  const handler = call?.[1]
  if (typeof handler === 'function') {
    handler(payload)
  }
}
