import { type MockChatSocket, MockSocket } from './mock-socket-manager'

export function createMockSocket(): MockChatSocket {
  return new MockSocket()
}
