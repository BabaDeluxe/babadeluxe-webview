/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import AuthCallbackView from '@/views/AuthCallbackView.vue'
import { SUPABASE_CLIENT_KEY, LOGGER_KEY } from '@/injection-keys'
import { createPinia, setActivePinia } from 'pinia'

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

describe('AuthCallbackView', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.clearAllMocks()

    // Reset URL
    window.history.replaceState({}, '', '/')
    await router.push('/')
    await router.isReady()
  })

  it('handles implicit flow (hash params)', async () => {
    window.location.hash = '#access_token=abc&refresh_token=def'
    mockSupabase.auth.setSession.mockResolvedValue({ error: null })

    mount(AuthCallbackView, {
      global: {
        plugins: [router],
        provide: {
          [SUPABASE_CLIENT_KEY as symbol]: mockSupabase,
          [LOGGER_KEY as symbol]: mockLogger,
        },
      },
    })

    // Small delay for onMounted async logic
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(mockSupabase.auth.setSession).toHaveBeenCalledWith({
      access_token: 'abc',
      refresh_token: 'def',
    })
    expect(router.currentRoute.value.path).toBe('/chat')
  })

  it('handles PKCE flow (query params)', async () => {
    window.history.replaceState({}, '', '/auth/callback?code=123')
    await router.push('/auth/callback?code=123')
    mockSupabase.auth.exchangeCodeForSession.mockResolvedValue({ error: null })

    mount(AuthCallbackView, {
      global: {
        plugins: [router],
        provide: {
          [SUPABASE_CLIENT_KEY as symbol]: mockSupabase,
          [LOGGER_KEY as symbol]: mockLogger,
        },
      },
    })

    await new Promise(resolve => setTimeout(resolve, 0))

    expect(mockSupabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('123')
    expect(router.currentRoute.value.path).toBe('/chat')
  })

  it('handles error in hash', async () => {
    window.location.hash = '#error=access_denied&error_description=User+denied+access'

    mount(AuthCallbackView, {
      global: {
        plugins: [router],
        provide: {
          [SUPABASE_CLIENT_KEY as symbol]: mockSupabase,
          [LOGGER_KEY as symbol]: mockLogger,
        },
      },
    })

    await new Promise(resolve => setTimeout(resolve, 0))

    expect(mockLogger.error).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('redirects to login if no session info and no active session', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } })

    mount(AuthCallbackView, {
      global: {
        plugins: [router],
        provide: {
          [SUPABASE_CLIENT_KEY as symbol]: mockSupabase,
          [LOGGER_KEY as symbol]: mockLogger,
        },
      },
    })

    await new Promise(resolve => setTimeout(resolve, 0))

    expect(router.currentRoute.value.path).toBe('/login')
  })
})
