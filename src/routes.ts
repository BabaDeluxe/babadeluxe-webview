import { createMemoryHistory, createRouter, createWebHistory } from 'vue-router'
import type { Router } from 'vue-router'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useIsInVsCode } from '@/composables/use-is-in-vs-code'
import { isOfflineMode } from '@/env-validator'

export function createAppRouter(supabase: SupabaseClient): Router {
  const { isInVsCode } = useIsInVsCode()
  const offline = isOfflineMode()

  const router = createRouter({
    history: isInVsCode.value ? createMemoryHistory() : createWebHistory(),
    routes: [
      {
        path: '/',
        alias: '/login',
        name: 'login',
        component: async () => import('./views/LoginView.vue'),
        meta: { layout: 'blank' },
      },
      {
        path: '/reset-password',
        name: 'reset-password',
        component: async () => import('./views/ResetPasswordView.vue'),
        meta: { layout: 'blank' },
      },
      {
        path: '/auth/callback',
        name: 'auth-callback',
        component: async () => import('./views/AuthCallbackView.vue'),
        meta: { requiresAuth: false, layout: 'blank' },
      },
      {
        path: '/chat',
        name: 'chat',
        component: async () => import('./views/ChatView.vue'),
        meta: { requiresAuth: true, layout: 'default' },
      },
      {
        path: '/history',
        name: 'history',
        component: async () => import('./views/HistoryView.vue'),
        meta: { requiresAuth: true, layout: 'default' },
      },
      {
        path: '/prompts',
        name: 'prompts',
        component: async () => import('./views/PromptsView.vue'),
        meta: { requiresAuth: true, layout: 'default' },
      },
      {
        path: '/settings',
        name: 'settings',
        component: async () => import('./views/SettingsView.vue'),
        meta: { requiresAuth: true, layout: 'default' },
      },
    ],
  })

  router.beforeEach(async (to) => {
    const isOfflinePublicPath = ['/', '', '/login', '/reset-password', '/auth/callback'].includes(
      to.path
    )

    if (offline) {
      if (isOfflinePublicPath) {
        return { path: '/chat' }
      }

      return
    }

    const {
      data: { session },
    } = await supabase.auth.getSession()

    const isPublicRoute = !to.meta.requiresAuth
    const isAuthRedirectPath = ['/', '', '/login', '/auth/callback'].includes(to.path)
    const shouldRedirectAuthenticatedUser = isPublicRoute && isAuthRedirectPath && Boolean(session)

    if (shouldRedirectAuthenticatedUser) {
      return { path: '/chat' }
    }

    const isUnauthenticatedAccessToProtectedRoute = Boolean(to.meta.requiresAuth && !session)
    if (isUnauthenticatedAccessToProtectedRoute) {
      return { path: '/', query: { redirect: to.fullPath } }
    }
  })

  return router
}
