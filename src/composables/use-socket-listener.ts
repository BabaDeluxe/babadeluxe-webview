import { watch, onUnmounted, type Ref } from 'vue'
import type { Socket } from 'socket.io-client'

type SocketEventHandler = (...args: unknown[]) => void

export function useSocketListener<T extends Socket>(
  socketRef: Ref<T | undefined>,
  listeners: Record<string, SocketEventHandler>
) {
  const attachListeners = (socket: T) => {
    for (const [event, handler] of Object.entries(listeners)) {
      socket.on(event, handler as (...args: unknown[]) => void)
    }
  }

  const detachListeners = (socket: T) => {
    for (const [event, handler] of Object.entries(listeners)) {
      socket.off(event, handler as (...args: unknown[]) => void)
    }
  }

  watch(
    socketRef,
    (newSocket, oldSocket) => {
      if (oldSocket) detachListeners(oldSocket)
      if (newSocket) attachListeners(newSocket)
    },
    { immediate: true }
  )

  onUnmounted(() => {
    if (socketRef.value) detachListeners(socketRef.value)
  })
}
