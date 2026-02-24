import { createMemoryHistory, createRouter, createWebHistory } from 'vue-router'
import type { Router } from 'vue-router'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useIsInVsCode } from '@/composables/use-is-in-vs-code'
export function createAppRouter(supabase: SupabaseClient): Router {
  const { isInVsCode } = useIsInVsCode()

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
    const {
      data: { session },
    } = await supabase.auth.getSession()

    // If already logged in and user goes to `/` or `/login`, send them to `/chat`
    if (!to.meta.requiresAuth && (to.path === '/' || to.path === '/login') && session) {
      return { path: '/chat' }
    }

    if (to.meta.requiresAuth && !session) {
      return { path: '/', query: { redirect: to.fullPath } }
    }
  })

  return router
}
