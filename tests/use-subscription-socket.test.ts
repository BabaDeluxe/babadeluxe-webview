/**
 * @vitest-environment jsdom
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { mountComposable } from './helpers/mount-composable'
import { useSubscriptionSocket } from '@/composables/use-subscription-socket'
import { LOGGER_KEY, SOCKET_MANAGER_KEY } from '@/injection-keys'

type Handler = (payload?: unknown) => void
type HandlerMap = Record<string, Handler[]>

interface MockSocket {
  isConnected: boolean
  on: (event: string, handler: Handler) => void
  off: (event: string, handler: Handler) => void
  emit: (event: string, ...args: unknown[]) => void
  waitForConnection: () => Promise<{ isErr: () => boolean; error?: Error }>
  handlers: HandlerMap
}

function createMockSocket(): MockSocket {
  const handlers: HandlerMap = {}

  return {
    isConnected: true,
    on: vi.fn((event: string, handler: Handler) => {
      handlers[event] ??= []
      handlers[event]!.push(handler)
    }),
    off: vi.fn((event: string, handler: Handler) => {
      handlers[event] = (handlers[event] || []).filter((h) => h !== handler)
    }),
    emit: vi.fn(),
    waitForConnection: vi.fn(),
    handlers,
  }
}

function trigger(socket: MockSocket, event: string, payload?: unknown) {
  for (const handler of socket.handlers[event] || []) {
    handler(payload)
  }
}

describe('useSubscriptionSocket', () => {
  let subscriptionSocket: MockSocket
  let chatSocket: MockSocket
  let logger: any
  let provideOptions: Record<symbol, unknown>

  beforeEach(() => {
    vi.resetModules()
    subscriptionSocket = createMockSocket()
    chatSocket = createMockSocket()
    logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }

    provideOptions = {
      [SOCKET_MANAGER_KEY as symbol]: {
        subscriptionSocket,
        chatSocket,
      },
      [LOGGER_KEY as symbol]: logger,
    }

    subscriptionSocket.waitForConnection = vi.fn().mockResolvedValue({
      isErr: () => false,
    })
  })

  const useSubscriptionWithProvide = () =>
    mountComposable(() => useSubscriptionSocket(), {
      global: {
        provide: provideOptions,
      },
    })

  it('shows modal when message limit is reached', () => {
    const { isMessageLimitReached, shouldShowModal } = useSubscriptionWithProvide()

    expect(isMessageLimitReached.value).toBe(false)
    expect(shouldShowModal.value).toBe(false)

    trigger(chatSocket, 'subscription:messageLimitReached')

    expect(isMessageLimitReached.value).toBe(true)
    expect(shouldShowModal.value).toBe(true)
  })

  it('hides modal when user tier becomes PRO', () => {
    const { isMessageLimitReached, shouldShowModal } = useSubscriptionWithProvide()

    trigger(chatSocket, 'subscription:messageLimitReached')
    expect(shouldShowModal.value).toBe(true)

    trigger(subscriptionSocket, 'subscription:userTierChanged', { tier: 'PRO' })

    expect(isMessageLimitReached.value).toBe(false)
    expect(shouldShowModal.value).toBe(false)
  })

  it('redirectToCheckout sets error on connection failure', async () => {
    subscriptionSocket.waitForConnection = vi.fn().mockResolvedValue({
      isErr: () => true,
      error: new Error('connect fail'),
    })

    const { redirectToCheckout, error, isUpgrading } = useSubscriptionWithProvide()

    await redirectToCheckout()
    await nextTick()

    expect(isUpgrading.value).toBe(false)
    expect(error.value).toContain('connect fail')
  })

  it('redirectToCheckout redirects on success', async () => {
    subscriptionSocket.waitForConnection = vi.fn().mockResolvedValue({
      isErr: () => false,
    })

    subscriptionSocket.emit = vi.fn().mockImplementation((event: string, ...args: unknown[]) => {
      if (event !== 'subscription:createCheckoutSession') return
      const cb = args[0] as (response: { success: boolean; checkoutUrl?: string }) => void
      cb({ success: true, checkoutUrl: 'https://stripe.test/checkout' })
    })

    const originalHref = window.location.href
    Object.defineProperty(window, 'location', {
      value: { href: originalHref },
      writable: true,
    })

    const { redirectToCheckout, error, isUpgrading } = useSubscriptionWithProvide()

    await redirectToCheckout()
    await nextTick()

    expect(isUpgrading.value).toBe(false)
    expect(error.value).toBeUndefined()
    expect(window.location.href).toBe('https://stripe.test/checkout')
  })

  it('redirectToCheckout sets error on backend failure', async () => {
    subscriptionSocket.waitForConnection = vi.fn().mockResolvedValue({
      isErr: () => false,
    })

    subscriptionSocket.emit = vi.fn().mockImplementation((event: string, ...args: unknown[]) => {
      if (event !== 'subscription:createCheckoutSession') return
      const cb = args[0] as (response: { success: boolean; error?: string }) => void
      cb({ success: false, error: 'no session' })
    })

    const { redirectToCheckout, error, isUpgrading } = useSubscriptionWithProvide()

    await redirectToCheckout()
    await nextTick()

    expect(isUpgrading.value).toBe(false)
    expect(error.value).toBe('no session')
  })
})
