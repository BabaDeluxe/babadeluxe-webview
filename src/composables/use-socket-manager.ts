import { type Ref, watch } from 'vue'
import type { SocketManager } from '@/socket-manager'
import { safeInject } from '@/safe-inject'
import { SOCKET_MANAGER_KEY } from '@/injection-keys'
import { NetworkError } from '@/errors'
import { socketTimeoutMs } from '@/constants'
import { useTrackedTimeouts } from '@/composables/use-tracked-timeouts'

export function useSocketManager() {
  const socketManagerRef = safeInject<Ref<SocketManager | undefined>>(SOCKET_MANAGER_KEY)

  const { createTimeout } = useTrackedTimeouts()

  async function getSocketManager(): Promise<SocketManager> {
    if (socketManagerRef.value) return socketManagerRef.value

    return new Promise<SocketManager>((resolve, reject) => {
      const stopManagerWatcher = watch(
        socketManagerRef,
        (initializedManager) => {
          if (initializedManager) {
            stopManagerWatcher()
            resolve(initializedManager)
          }
        },
        { immediate: true }
      )

      createTimeout(() => {
        const isManagerInitialized = socketManagerRef.value !== undefined
        if (isManagerInitialized) return

        stopManagerWatcher()
        reject(new NetworkError('SocketManager initialization timeout'))
      }, socketTimeoutMs.init)
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
