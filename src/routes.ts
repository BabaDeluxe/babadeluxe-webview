import { createMemoryHistory, createRouter } from 'vue-router'
import type { Router } from 'vue-router'
import type { SupabaseClient } from '@supabase/supabase-js'

export function createAppRouter(supabase: SupabaseClient): Router {
  const router = createRouter({
    history: createMemoryHistory(),
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
        component: async () => import('./views/ResetPassword.vue'),
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

    if (to.meta.requiresAuth && !session) {
      return { path: '/' }
    }
  })

  return router
}
