/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import AuthCallbackView from '@/views/AuthCallbackView.vue'
import { SUPABASE_CLIENT_KEY, LOGGER_KEY } from '@/injection-keys'
import { createPinia, setActivePinia } from 'pinia'

const mockSession = {
  /* eslint-disable-next-line @typescript-eslint/naming-convention */
  access_token: 'abc',
  user: { id: '1' },
}

// Mock Supabase
const mockSupabase = {
  auth: {
    setSession: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
  },
}

// Mock Logger
const mockLogger = {
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}

// Mock Router
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div>Home</div>' } },
    { path: '/auth/callback', name: 'auth-callback', component: AuthCallbackView },
    { path: '/login', name: 'login', component: { template: '<div>Login</div>' } },
    { path: '/chat', name: 'chat', component: { template: '<div>Chat</div>' } },
  ],
})

vi.mock('@/env-validator', async (orig) => {
  const actual = await orig<any>()
  return {
    ...actual,
    isOfflineMode: () => false,
  }
})

describe('AuthCallbackView', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.clearAllMocks()

    // Default: no active session
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } })

    // Reset URL
    window.history.replaceState({}, '', '/')
    await router.push('/')
    await router.isReady()
  })

  it('handles implicit flow (hash params)', async () => {
    window.history.replaceState({}, '', '/auth/callback#access_token=abc&refresh_token=def')
    await router.push('/auth/callback#access_token=abc&refresh_token=def')
    mockSupabase.auth.setSession.mockResolvedValue({ data: {}, error: null })
    // Verify that we check session after setting it
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: mockSession } })

    mount(AuthCallbackView, {
      global: {
        plugins: [router],
        provide: {
          [SUPABASE_CLIENT_KEY as symbol]: mockSupabase,
          [LOGGER_KEY as symbol]: mockLogger,
        },
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(mockSupabase.auth.setSession).toHaveBeenCalledWith({
      /* eslint-disable @typescript-eslint/naming-convention */
      access_token: 'abc',
      refresh_token: 'def',
      /* eslint-enable @typescript-eslint/naming-convention */
    })
    expect(router.currentRoute.value.path).toBe('/chat')
  })

  it('handles PKCE flow (query params)', async () => {
    window.history.replaceState({}, '', '/auth/callback?code=123')
    await router.push('/auth/callback?code=123')
    mockSupabase.auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null })
    // Verify that we check session after exchange
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: mockSession } })

    mount(AuthCallbackView, {
      global: {
        plugins: [router],
        provide: {
          [SUPABASE_CLIENT_KEY as symbol]: mockSupabase,
          [LOGGER_KEY as symbol]: mockLogger,
        },
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(mockSupabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('123')
    expect(router.currentRoute.value.path).toBe('/chat')
  })

  it('handles error in hash', async () => {
    window.history.replaceState(
      {},
      '',
      '/auth/callback#error=access_denied&error_description=User+denied+access'
    )
    await router.push('/auth/callback#error=access_denied&error_description=User+denied+access')

    const wrapper = mount(AuthCallbackView, {
      global: {
        plugins: [router],
        provide: {
          [SUPABASE_CLIENT_KEY as symbol]: mockSupabase,
          [LOGGER_KEY as symbol]: mockLogger,
        },
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(mockLogger.error).toHaveBeenCalled()
    expect(wrapper.text()).toContain('User denied access')

    await wrapper.find('button').trigger('click')
    // Wait for navigation
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('redirects to login if no session info and no active session', async () => {
    window.history.replaceState({}, '', '/auth/callback')
    await router.push('/auth/callback')
    // getSession already returns null from beforeEach — no override needed

    mount(AuthCallbackView, {
      global: {
        plugins: [router],
        provide: {
          [SUPABASE_CLIENT_KEY as symbol]: mockSupabase,
          [LOGGER_KEY as symbol]: mockLogger,
        },
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(router.currentRoute.value.path).toBe('/login')
  })
})
