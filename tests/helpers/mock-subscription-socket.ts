import { MockSocket, type MockSubscriptionSocket } from './mock-socket-manager'

export function createMockSocket(): MockSubscriptionSocket {
  return new MockSocket()
}
