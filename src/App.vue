<template>
  <div
    class="h-100vh max-h-100vh min-h-100vh max-w-100vw min-w-100vw bg-slate flex flex-col font-onest text-deepText overflow-x-hidden"
  >
    <div v-if="session && $route.path !== '/'">
      <header
        class="flex items-center justify-between p-2 bg-panel border-b border-borderMuted/20"
        data-testid="app-header"
      >
        <IconBabaDeluxe />

        <div class="flex flex-row gap-2 justify-end items-center">
          <BaseButton
            data-testid="nav-new-chat-button"
            variant="primary"
            icon="i-weui:pencil-outlined"
            text="New Chat"
            @click="handleNewChat"
          />

          <BaseButton
            data-testid="nav-settings-button"
            variant="ghost"
            icon="i-weui:setting-outlined"
            class="zoom-1.2"
            @click="router.push('/settings')"
          />
        </div>
      </header>

      <div class="flex justify-start items-center bg-panel">
        <nav
          class="flex flex-row gap-2 text-deepText p-2"
          data-testid="app-nav"
        >
          <RouterLink
            v-slot="{ navigate, isExactActive }"
            to="/chat"
            custom
          >
            <BaseButton
              variant="menu"
              data-testid="nav-chat-link"
              :is-selected="isExactActive"
              @click="navigate"
            >
              Chat
            </BaseButton>
          </RouterLink>

          <RouterLink
            v-slot="{ navigate, isExactActive }"
            to="/history"
            custom
          >
            <BaseButton
              variant="menu"
              data-testid="nav-history-link"
              :is-selected="isExactActive"
              @click="navigate"
            >
              History
            </BaseButton>
          </RouterLink>

          <RouterLink
            v-slot="{ navigate, isExactActive }"
            to="/prompts"
            custom
          >
            <BaseButton
              variant="menu"
              data-testid="nav-prompts-link"
              :is-selected="isExactActive"
              @click="navigate"
            >
              Prompts
            </BaseButton>
          </RouterLink>
        </nav>
      </div>
    </div>

    <Suspense>
      <template #default>
        <Suspense suspensible>
          <div class="flex-1 min-h-0 flex flex-col bg-slate overflow-hidden">
            <RouterView v-slot="{ Component }">
              <Transition mode="out-in">
                <KeepAlive :include="['ChatView', 'HistoryView', 'PromptsView']">
                  <component
                    :is="Component"
                    class="flex-1 min-h-0 flex flex-col animate-fade-in animate-duration-150 animate-ease-out"
                  />
                </KeepAlive>
              </Transition>
            </RouterView>
          </div>
        </Suspense>
      </template>
    </Suspense>

    <ToastLayer />
  </div>
</template>

<script setup lang="ts">
import { onErrorCaptured } from 'vue'
import { RouterLink, RouterView, useRouter } from 'vue-router'
import IconBabaDeluxe from '@/components/IconBabaDeluxe.vue'
import BaseButton from '@/components/BaseButton.vue'
import ToastLayer from '@/components/ToastLayer.vue'
import { useToastStore } from '@/stores/use-toast-store'
import { safeInject } from '@/safe-inject'
import { loggerKey } from '@/injection-keys'
import { useAppLogic } from '@/composables/use-app-logic'

const logger = safeInject(loggerKey)
const router = useRouter()
const toasts = useToastStore()
const { session, handleNewChat } = useAppLogic()

onErrorCaptured((err, instance, info) => {
  logger.error('Something crashed', {
    vueInfo: info,
    componentName: instance?.$options?.name,
    error: err,
  })

  toasts.error('Something crashed. Please reload.')
  return false
})
</script>
