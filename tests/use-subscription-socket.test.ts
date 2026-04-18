/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref } from 'vue'
import { useSubscriptionSocket } from '@/composables/use-subscription-socket'
import { socketManagerKey } from '@/injection-keys'
import { mountComposable } from './helpers/mount-composable'
import {
  type MockSubscriptionSocket,
  createMockSocket as createMockSubscriptionSocket,
} from './helpers/mock-subscription-socket'
import { trigger as triggerSocketEvent } from './helpers/mock-socket-manager'

async function trigger(
  socket: MockSubscriptionSocket,
  event: string,
  payload: unknown
): Promise<void> {
  return triggerSocketEvent(socket, event, payload)
}

describe('useSubscriptionSocket()', () => {
  let subscriptionSocket: MockSubscriptionSocket
  let chatSocket: MockSubscriptionSocket

  function mountSubscriptionSocket() {
    return mountComposable(() => useSubscriptionSocket(), {
      global: {
        provide: {
          [socketManagerKey as symbol]: ref({
            subscriptionSocket,
            chatSocket,
          }),
        },
      },
    })
  }

  beforeEach(() => {
    subscriptionSocket = createMockSubscriptionSocket()
    chatSocket = createMockSubscriptionSocket()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('real-time subscription events', () => {
    it('sets message limit flag and shows modal on subscription:messageLimitReached', () => {
      const { isMessageLimitReached, shouldShowModal } = mountSubscriptionSocket()

      trigger(chatSocket, 'subscription:messageLimitReached', {})

      expect(isMessageLimitReached.value).toBe(true)
      expect(shouldShowModal.value).toBe(true)
    })

    it('resets message limit flags when user tier changes to PRO', () => {
      const { isMessageLimitReached, shouldShowModal } = mountSubscriptionSocket()

      trigger(chatSocket, 'subscription:messageLimitReached', {})
      expect(isMessageLimitReached.value).toBe(true)
      expect(shouldShowModal.value).toBe(true)

      trigger(subscriptionSocket, 'subscription:userTierChanged', { tier: 'PRO' })

      expect(isMessageLimitReached.value).toBe(false)
      expect(shouldShowModal.value).toBe(false)
    })

    it('updates error when subscription:checkoutSessionError is emitted', () => {
      const { error } = mountSubscriptionSocket()

      trigger(subscriptionSocket, 'subscription:checkoutSessionError', {
        error: 'Checkout failed',
      })

      expect(error.value?.message).toMatch(/Checkout/i)
      expect(error.value?.message).toContain('failed')
    })
  })

  describe('dismissModal', () => {
    it('hides modal but keeps message limit flag', () => {
      const { isMessageLimitReached, shouldShowModal, dismissModal } = mountSubscriptionSocket()

      trigger(chatSocket, 'subscription:messageLimitReached', {})
      expect(isMessageLimitReached.value).toBe(true)
      expect(shouldShowModal.value).toBe(true)

      dismissModal()

      expect(isMessageLimitReached.value).toBe(true)
      expect(shouldShowModal.value).toBe(false)
    })
  })

  describe('redirectToCheckout', () => {
    it('returns Err when socket not connected', async () => {
      const { redirectToCheckout } = mountComposable(() => useSubscriptionSocket(), {
        global: {
          provide: {
            [socketManagerKey as symbol]: {},
          },
        },
      })

      const result = await redirectToCheckout()

      expect(result.isErr()).toBe(true)
    })

    it('returns Err and sets error when backend returns failure', async () => {
      subscriptionSocket.emit = vi.fn(
        (
          event: string,
          callback: (resp: { success: boolean; checkoutUrl?: string; error?: string }) => void
        ) => {
          if (event === 'subscription:createCheckoutSession') {
            callback({ success: false, error: 'Backend failure' })
          }
          return {
            isOk: () => true,
            isErr: () => false,
          }
        }
      )

      const { redirectToCheckout, error } = mountSubscriptionSocket()

      const result = await redirectToCheckout()

      expect(result.isErr()).toBe(true)
    })
  })
})
