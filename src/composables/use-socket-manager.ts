import { type Ref, watch } from 'vue'
import type { SocketManager } from '@/socket-manager'
import { safeInject } from '@/safe-inject'
import { socketManagerKey } from '@/injection-keys'
import { NetworkError } from '@/errors'
import { socketTimeoutMs } from '@/constants'
import { useTrackedTimeouts } from '@/composables/use-tracked-timeouts'

export function useSocketManager() {
  const socketManagerRef = safeInject<Ref<SocketManager | undefined>>(socketManagerKey)

  const { createTimeout } = useTrackedTimeouts()

  async function getSocketManager(): Promise<SocketManager> {
    if (socketManagerRef.value) return socketManagerRef.value

    return new Promise<SocketManager>((resolve, reject) => {
      const stopWatcher = watch(
        socketManagerRef,
        (newManager) => {
          if (newManager) {
            stopWatcher()
            resolve(newManager)
          }
        },
        { immediate: true }
      )

      createTimeout(() => {
        if (socketManagerRef.value) return
        stopWatcher()
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
