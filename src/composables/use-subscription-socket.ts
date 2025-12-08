import { ref, onBeforeUnmount, inject, readonly, computed } from 'vue'
import type { ConsoleLogger } from '@simwai/utils'
import type { SocketManager } from '@/socket-manager'
import { LOGGER_KEY, SOCKET_MANAGER_KEY } from '@/injection-keys'
import { ResultAsync } from 'neverthrow'
import { SubscriptionError } from '@/errors'

export function useSubscriptionSocket() {
  const socketManager: SocketManager = inject(SOCKET_MANAGER_KEY)!
  const logger: ConsoleLogger = inject(LOGGER_KEY)!

  const subscriptionSocket = socketManager.subscriptionSocket

  const isUpgrading = ref(false)
  const error = ref<string | undefined>()
  const isMessageLimitReached = ref(false)
  const isDismissed = ref(false)

  const onMessageLimitReached = () => {
    logger.warn('Message limit reached. Redirecting to upsell page.')
    isMessageLimitReached.value = true
    isDismissed.value = false
  }

  const onUserTierChanged = (payload: { tier: string }) => {
    logger.log(`User tier changed to: ${payload.tier}`)
    if (payload.tier === 'PRO') {
      isMessageLimitReached.value = false
      isDismissed.value = false
    }
  }

  const dismissModal = () => {
    isDismissed.value = true
  }

  const shouldShowModal = computed(() => {
    const result: boolean = isMessageLimitReached.value && !isDismissed.value
    return result
  })

  const onCheckoutSessionError = (payload: { error: string }) => {
    logger.error('Checkout session error:', payload.error)
    error.value = payload.error
  }

  subscriptionSocket.on('messageLimitReached', onMessageLimitReached)
  subscriptionSocket.on('userTierChanged', onUserTierChanged)
  subscriptionSocket.on('checkoutSessionError', onCheckoutSessionError)

  onBeforeUnmount(() => {
    subscriptionSocket.off('messageLimitReached', onMessageLimitReached)
    subscriptionSocket.off('userTierChanged', onUserTierChanged)
    subscriptionSocket.off('checkoutSessionError', onCheckoutSessionError)
  })

  const redirectToCheckout = async (): Promise<void> => {
    isUpgrading.value = true
    error.value = undefined

    const waitResult = await subscriptionSocket.waitForConnection()
    if (waitResult.isErr()) {
      isUpgrading.value = false
      error.value = waitResult.error.message
      logger.error('Subscription socket connection failed:', waitResult.error)
      return
    }

    const checkoutResult = await ResultAsync.fromPromise(
      new Promise<{ success: boolean; checkoutUrl?: string; error?: string }>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new SubscriptionError('Server acknowledgment timeout'))
        }, 10000)

        subscriptionSocket.emit(
          'createCheckoutSession',
          (
            response:
              | { success: boolean; checkoutUrl?: string; error?: string }
              | PromiseLike<{ success: boolean; checkoutUrl?: string; error?: string }>
          ) => {
            clearTimeout(timeoutId)
            resolve(response)
          }
        )
      }),
      (unknownError: unknown) => new SubscriptionError(String(unknownError))
    )

    checkoutResult.match(
      (response) => {
        isUpgrading.value = false

        if (response.success && response.checkoutUrl) {
          logger.log('Redirecting to Stripe checkout...')
          window.location.href = response.checkoutUrl
        } else {
          error.value = response.error ?? 'Failed to create checkout session'
          logger.error('Subscription socket error:', error.value)
        }
      },
      (checkoutError) => {
        isUpgrading.value = false
        error.value = checkoutError.message
        logger.error('Subscription socket error:', checkoutError)
      }
    )
  }

  return {
    isUpgrading: readonly(isUpgrading),
    error: readonly(error),
    isMessageLimitReached: readonly(isMessageLimitReached),
    redirectToCheckout,
    isConnected: subscriptionSocket.isConnected,
    shouldShowModal: readonly(shouldShowModal),
    dismissModal,
  }
}
