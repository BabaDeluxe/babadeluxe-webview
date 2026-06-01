<template>
  <div
    class="h-100vh max-h-100vh min-h-100vh max-w-100vw min-w-100vw bg-slate flex flex-col font-onest text-deepText overflow-x-hidden"
  >
    <div v-if="isHeaderVisible">
      <header
        class="flex flex-row items-center justify-between p-2 bg-panel border-b border-borderMuted/20 h-14"
        data-testid="app-header"
      >
        <div class="flex-1 flex justify-start"><IconBabaDeluxe /></div>

        <nav
          class="flex md:hidden flex-row gap-1 items-center mx-auto bg-slate/40 p-1 rounded-xl border border-borderMuted/15"
          data-testid="mobile-nav"
        >
          <RouterLink
            v-slot="{ navigate, isExactActive }"
            to="/chat"
            custom
          >
            <BaseButton
              variant="menu"
              icon="i-bi:chat-dots"
              title="Chat"
              class="w-10 h-10 p-0"
              :is-selected="isExactActive"
              @click="navigate"
            />
          </RouterLink>

          <RouterLink
            v-slot="{ navigate, isExactActive }"
            to="/history"
            custom
          >
            <BaseButton
              variant="menu"
              icon="i-bi:clock-history"
              title="History"
              class="w-10 h-10 p-0"
              :is-selected="isExactActive"
              @click="navigate"
            />
          </RouterLink>

          <RouterLink
            v-slot="{ navigate, isExactActive }"
            to="/prompts"
            custom
          >
            <BaseButton
              variant="menu"
              icon="i-hugeicons:quill-write-02"
              title="Prompts"
              class="w-10 h-10 p-0"
              :is-selected="isExactActive"
              @click="navigate"
            />
          </RouterLink>
        </nav>

        <div class="flex-1 flex flex-row gap-2 justify-end items-center">
          <BaseButton
            data-testid="nav-new-chat-button"
            variant="primary"
            icon="i-bi:plus-lg"
            title="New Chat"
            class="md:w-auto w-9 h-9 md:h-auto"
            @click="handleNewChat"
          >
            <span class="hidden md:inline-block">New Chat</span>
          </BaseButton>

          <BaseDropdownMenu
            trigger-testid="nav-user-menu-button"
            menu-testid="nav-user-menu-dropdown"
          >
            <template #trigger>
              <BaseAvatar
                role="user"
                size="xs"
              />
            </template>

            <template #default="{ close }">
              <div class="flex flex-col gap-1 p-1">
                <BaseButton
                  data-testid="nav-settings-button"
                  variant="ghost"
                  icon="i-weui:setting-outlined"
                  class="w-full justify-start"
                  @click="
                    () => {
                      router.push('/settings')
                      close()
                    }
                  "
                >
                  Settings
                </BaseButton>

                <div class="border-t border-borderMuted my-1" />

                <BaseButton
                  data-testid="nav-logout-button"
                  variant="ghost"
                  icon="i-bi:box-arrow-right"
                  class="w-full justify-start text-error"
                  @click="
                    () => {
                      handleLogout()
                      close()
                    }
                  "
                >
                  Logout
                </BaseButton>
              </div>
            </template>
          </BaseDropdownMenu>
        </div>
      </header>

      <div class="hidden md:flex justify-start items-center bg-panel">
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
              icon="i-bi:chat-dots"
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
              icon="i-bi:clock-history"
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
              icon="i-hugeicons:quill-write-02"
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
                  <ViewErrorBoundary>
                    <component
                      :is="Component"
                      class="flex-1 min-h-0 flex flex-col animate-fade-in animate-duration-150 animate-ease-out"
                    />
                  </ViewErrorBoundary>
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
import { RouterLink, RouterView, useRouter, useRoute } from 'vue-router'
import { provide, onErrorCaptured, computed } from 'vue'
import IconBabaDeluxe from '@/components/IconBabaDeluxe.vue'
import BaseButton from '@/components/BaseButton.vue'
import BaseAvatar from '@/components/BaseAvatar.vue'
import BaseDropdownMenu from '@/components/BaseDropdownMenu.vue'
import ToastLayer from '@/components/ToastLayer.vue'
import ViewErrorBoundary from '@/components/ViewErrorBoundary.vue'
import { useAppLogic } from '@/composables/use-app-logic'
import { useToastStore } from '@/stores/use-toast-store'
import { logger } from '@/logger'
import { GIT_MESSAGE_KEY } from '@/injection-keys'

const router = useRouter()
const route = useRoute()
const toasts = useToastStore()
const { session, handleNewChat, handleLogout, gitMessage } = useAppLogic()

provide(GIT_MESSAGE_KEY, gitMessage)

const isHeaderVisible = computed(() => {
  const hasActiveSession = Boolean(session.value)
  const isDefaultLayout = route.meta.layout === 'default'
  return hasActiveSession && isDefaultLayout
})

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
