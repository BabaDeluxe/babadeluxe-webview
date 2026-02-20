import type { Ref } from 'vue'
import type { SocketManager } from '@/socket-manager'
import { safeInject } from '@/safe-inject'
import { SOCKET_MANAGER_KEY } from '@/injection-keys'
import { NetworkError } from '@/errors'

export function useSocketManager() {
  const socketManagerRef = safeInject<Ref<SocketManager | undefined>>(SOCKET_MANAGER_KEY)

  async function getSocketManager(): Promise<SocketManager> {
    if (socketManagerRef.value) return socketManagerRef.value

    return new Promise<SocketManager>((resolve, reject) => {
      const start = Date.now()
      const intervalId = window.setInterval(() => {
        if (socketManagerRef.value) {
          window.clearInterval(intervalId)
          resolve(socketManagerRef.value)
          return
        }

        if (Date.now() - start > 15_000) {
          window.clearInterval(intervalId)
          reject(new NetworkError('SocketManager initialization timeout'))
        }
      }, 50)
    })
  }

  async function withSocketManager<T>(fn: (manager: SocketManager) => Promise<T> | T): Promise<T> {
    const manager = await getSocketManager()
    return fn(manager)
  }

  return {
    socketManagerRef,
    getSocketManager,
    withSocketManager,
  }
}
