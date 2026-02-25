import { MockSocket } from './mock-socket-manager'

export type MockChatSocket = MockSocket

export function createMockSocket(): MockChatSocket {
  return new MockSocket()
}
