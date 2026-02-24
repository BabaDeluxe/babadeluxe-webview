import { MockSocket } from './mock-socket-manager'

export type MockSubscriptionSocket = MockSocket

export function createMockSocket(): MockSubscriptionSocket {
  return new MockSocket()
}
