/* eslint-disable @typescript-eslint/no-explicit-any */
import { ref } from 'vue'
import { ok } from 'neverthrow'

export function createMockSocketManager(overrides: any = {}) {
  const socket: any = {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    once: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    waitForConnection: vi.fn().mockResolvedValue(ok(undefined)),
    isConnected: true,
    ...overrides,
  }

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
