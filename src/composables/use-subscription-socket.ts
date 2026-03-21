import { ref, onBeforeUnmount, readonly, computed, watch } from 'vue'
import type { SocketManager } from '@/socket-manager'
import { err, ok, type Result, ResultAsync } from 'neverthrow'
import { type SocketConnectionError, NetworkError, SocketError } from '@/errors'
import { socketTimeoutMs } from '@/constants'
import { useSocketManager } from '@/composables/use-socket-manager'
import { useTrackedTimeouts } from '@/composables/use-tracked-timeouts'
import {
  subscriptionSocketNotConnected,
  subscriptionSocketConnectionFailed,
  serverAcknowledgmentTimeout,
  failedToCreateCheckoutSession,
} from '@/composables/constants'

// ----------------------------------------------------------------------
// Types for attached handlers (both sockets)
// ----------------------------------------------------------------------
type AttachedHandlers = Readonly<{
  onUserTierChanged: (payload: { tier: string }) => void
  onCheckoutSessionError: (payload: { error: string }) => void
  onMessageLimitReached: () => void // from chat socket
}>

/**
 * We use a WeakMap to store the attached handlers for each socket instance.
 * This ensures that when the socket changes, we can easily detach the old handlers
 * and re‑attach them to the new socket without creating duplicate listeners.
 * The WeakMap also allows the garbage collector to clean up entries when a socket
 * is no longer referenced.
 *
 * Note: The chat socket is also included here because it fires the
 * 'subscription:messageLimitReached' event. Although it's not ideal to have
 * subscription events on the chat socket, it's a current architectural decision.
 */
const subscriptionHandlersBySocket = new WeakMap<object, AttachedHandlers>()
const chatHandlersBySocket = new WeakMap<object, AttachedHandlers>() // separate for chat socket

export function useSubscriptionSocket() {
  const { socketManagerRef } = useSocketManager()
  const { createTimeout, cancelTimeout } = useTrackedTimeouts()

  // Both sockets are needed: subscription socket for tier/checkout events,
  // and chat socket for the message limit event.
  const subscriptionSocketRef = computed(() => socketManagerRef.value?.subscriptionSocket)
  const chatSocketRef = computed(() => socketManagerRef.value?.chatSocket)

  const isUpgrading = ref(false)
  const error = ref<NetworkError | SocketError | undefined>()
  const isMessageLimitReached = ref(false)
  const isDismissed = ref(false)

  // --------------------------------------------------------------------
  // Event handlers
  // --------------------------------------------------------------------
  const onUserTierChanged = (payload: { tier: string }) => {
    if (payload.tier === 'PRO') {
      isMessageLimitReached.value = false
      isDismissed.value = false
    }
  }

  const onCheckoutSessionError = (payload: { error: string }) => {
    error.value = new NetworkError(payload.error)
  }

  const onMessageLimitReached = () => {
    isMessageLimitReached.value = true
    isDismissed.value = false
  }

  // --------------------------------------------------------------------
  // Attachment helpers (each socket gets its own WeakMap)
  // --------------------------------------------------------------------
  const attachSubscriptionListeners = (socket: SocketManager['subscriptionSocket']) => {
    let handlers = subscriptionHandlersBySocket.get(socket)
    if (!handlers) {
      handlers = { onUserTierChanged, onCheckoutSessionError, onMessageLimitReached }
      subscriptionHandlersBySocket.set(socket, handlers)
    }
    socket.on('subscription:userTierChanged', handlers.onUserTierChanged)
    socket.on('subscription:checkoutSessionError', handlers.onCheckoutSessionError)
  }

  const detachSubscriptionListeners = (socket: SocketManager['subscriptionSocket']) => {
    const handlers = subscriptionHandlersBySocket.get(socket)
    if (handlers) {
      socket.off('subscription:userTierChanged', handlers.onUserTierChanged)
      socket.off('subscription:checkoutSessionError', handlers.onCheckoutSessionError)
    }
  }

  const attachChatListeners = (socket: SocketManager['chatSocket']) => {
    let handlers = chatHandlersBySocket.get(socket)
    if (!handlers) {
      handlers = { onUserTierChanged, onCheckoutSessionError, onMessageLimitReached } // reuse type
      chatHandlersBySocket.set(socket, handlers)
    }
    socket.on('subscription:messageLimitReached', handlers.onMessageLimitReached)
  }

  const detachChatListeners = (socket: SocketManager['chatSocket']) => {
    const handlers = chatHandlersBySocket.get(socket)
    if (handlers) {
      socket.off('subscription:messageLimitReached', handlers.onMessageLimitReached)
    }
  }

  // --------------------------------------------------------------------
  // Watch both sockets
  // --------------------------------------------------------------------
  watch(
    [subscriptionSocketRef, chatSocketRef],
    ([newSub, newChat], [oldSub, oldChat]) => {
      if (oldSub) detachSubscriptionListeners(oldSub)
      if (oldChat) detachChatListeners(oldChat)

      if (newSub) attachSubscriptionListeners(newSub)
      if (newChat) attachChatListeners(newChat)
    },
    { immediate: true }
  )

  // --------------------------------------------------------------------
  // Cleanup on unmount
  // --------------------------------------------------------------------
  onBeforeUnmount(() => {
    const subSocket = subscriptionSocketRef.value
    const chatSocket = chatSocketRef.value
    if (subSocket) detachSubscriptionListeners(subSocket)
    if (chatSocket) detachChatListeners(chatSocket)
  })

  const dismissModal = () => {
    isDismissed.value = true
  }

  const shouldShowModal = computed(() => {
    return isMessageLimitReached.value && !isDismissed.value
  })

  // --------------------------------------------------------------------
  // Checkout action (unchanged)
  // --------------------------------------------------------------------
  const redirectToCheckout = async (): Promise<Result<void, SocketConnectionError>> => {
    const socket = subscriptionSocketRef.value
    if (!socket) {
      const e = new SocketError(subscriptionSocketNotConnected)
      error.value = e
      return err(e)
    }

    isUpgrading.value = true
    error.value = undefined

    const waitResult = await socket.waitForConnection()

    if (waitResult.isErr()) {
      isUpgrading.value = false
      const rootError = waitResult.error
      const mappedError =
        rootError instanceof NetworkError || rootError instanceof SocketError
          ? rootError
          : new NetworkError(subscriptionSocketConnectionFailed, rootError)
      error.value = mappedError
      return err(mappedError)
    }

    const responseResult = await ResultAsync.fromPromise(
      new Promise<{ success: boolean; checkoutUrl?: string; error?: string }>((resolve, reject) => {
        const timeoutId = createTimeout(() => {
          reject(new NetworkError(serverAcknowledgmentTimeout))
        }, socketTimeoutMs.subscription)

        socket.emit(
          'subscription:createCheckoutSession',
          (res: { success: boolean; checkoutUrl?: string; error?: string }) => {
            cancelTimeout(timeoutId)
            resolve(res)
          }
        )
      }),
      (error) => {
        return error instanceof NetworkError
          ? error
          : new NetworkError(failedToCreateCheckoutSession, error)
      }
    )

    isUpgrading.value = false

    if (responseResult.isErr()) {
      error.value = responseResult.error
      return err(responseResult.error)
    }

    const response = responseResult.value

    if (response.success && response.checkoutUrl) {
      window.location.href = response.checkoutUrl
      return ok(undefined)
    }

    const networkError = new NetworkError(response.error ?? failedToCreateCheckoutSession)
    error.value = networkError
    return err(networkError)
  }

  return {
    isUpgrading: readonly(isUpgrading),
    error: readonly(error),
    isMessageLimitReached: readonly(isMessageLimitReached),
    redirectToCheckout,
    isConnected: computed(() => subscriptionSocketRef.value?.isConnected ?? false),
    shouldShowModal: readonly(shouldShowModal),
    dismissModal,
  }
}
