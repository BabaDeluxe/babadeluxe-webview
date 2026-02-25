import { ref, onBeforeUnmount, readonly, computed, watch } from 'vue'
import type { SocketManager } from '@/socket-manager'
import { err, ok, ResultAsync, type Result } from 'neverthrow'
import type { SocketConnectionError } from '@/errors'
import { NetworkError, SocketError } from '@/errors'
import { socketTimeoutMs } from '@/constants'
import { useSocketManager } from '@/composables/use-socket-manager'

export function useSubscriptionSocket() {
  const { socketManagerRef } = useSocketManager()

  const subscriptionSocketRef = computed(() => socketManagerRef.value?.subscriptionSocket)
  const chatSocketRef = computed(() => socketManagerRef.value?.chatSocket)

  const isUpgrading = ref(false)
  const error = ref<string | undefined>()
  const isMessageLimitReached = ref(false)
  const isDismissed = ref(false)

  const onMessageLimitReached = () => {
    isMessageLimitReached.value = true
    isDismissed.value = false
  }

  const onUserTierChanged = (payload: { tier: string }) => {
    if (payload.tier === 'PRO') {
      isMessageLimitReached.value = false
      isDismissed.value = false
    }
  }

  const onCheckoutSessionError = (payload: { error: string }) => {
    error.value = payload.error
  }

  const attachListeners = (
    subSocket: SocketManager['subscriptionSocket'],
    chatSocket: SocketManager['chatSocket']
  ) => {
    subSocket.on('subscription:userTierChanged', onUserTierChanged)
    subSocket.on('subscription:checkoutSessionError', onCheckoutSessionError)
    chatSocket.on('subscription:messageLimitReached', onMessageLimitReached)
  }

  const detachListeners = (
    subSocket: SocketManager['subscriptionSocket'],
    chatSocket: SocketManager['chatSocket']
  ) => {
    subSocket.off('subscription:userTierChanged', onUserTierChanged)
    subSocket.off('subscription:checkoutSessionError', onCheckoutSessionError)
    chatSocket.off('subscription:messageLimitReached', onMessageLimitReached)
  }

  watch(
    [subscriptionSocketRef, chatSocketRef],
    ([newSub, newChat], [oldSub, oldChat]) => {
      if (oldSub && oldChat) detachListeners(oldSub, oldChat)
      if (newSub && newChat) attachListeners(newSub, newChat)
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    if (subscriptionSocketRef.value && chatSocketRef.value) {
      detachListeners(subscriptionSocketRef.value, chatSocketRef.value)
    }
  })

  const dismissModal = () => {
    isDismissed.value = true
  }

  const shouldShowModal = computed(() => {
    const result: boolean = isMessageLimitReached.value && !isDismissed.value
    return result
  })

  const redirectToCheckout = async (): Promise<Result<void, SocketConnectionError>> => {
    const socket = subscriptionSocketRef.value
    if (!socket) {
      const socketError = new SocketError('Subscription socket not connected')
      error.value = socketError.message
      return err(socketError)
    }

    isUpgrading.value = true
    error.value = undefined

    const waitResult = await socket.waitForConnection()

    isUpgrading.value = false
    if (waitResult.isErr()) {
      const rootError = waitResult.error
      const mappedError =
        rootError instanceof NetworkError || rootError instanceof SocketError
          ? rootError
          : new NetworkError('Subscription socket connection failed', rootError)
      error.value = mappedError.message
      return err(mappedError)
    }

    const checkoutResult = await ResultAsync.fromPromise(
      new Promise<{ success: boolean; checkoutUrl?: string; error?: string }>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new NetworkError('Server acknowledgment timeout'))
        }, socketTimeoutMs.subscription)

        socket.emit(
          'subscription:createCheckoutSession',
          (response: { success: boolean; checkoutUrl?: string; error?: string }) => {
            clearTimeout(timeoutId)
            resolve(response)
          }
        )
      }),
      (unknownError: unknown): NetworkError =>
        unknownError instanceof NetworkError
          ? unknownError
          : new NetworkError('Failed to create checkout session', unknownError)
    )

    if (checkoutResult.isErr()) {
      error.value = checkoutResult.error.message
      return err(checkoutResult.error)
    }

    const response = checkoutResult.value

    if (response.success && response.checkoutUrl) {
      window.location.href = response.checkoutUrl
      return ok(undefined)
    }

    const errorMessage = response.error ?? 'Failed to create checkout session'
    const networkError = new NetworkError(errorMessage)
    error.value = networkError.message
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
