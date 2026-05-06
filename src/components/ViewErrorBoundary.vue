<template>
  <template v-if="capturedError">
    <div
      class="flex-1 min-h-0 flex flex-col items-center justify-center p-6 gap-4 overflow-auto"
      data-testid="view-error-boundary"
    >
      <template v-if="isNotProd">
        <div class="w-full max-w-2xl flex flex-col gap-3">
          <p class="text-error font-semibold text-sm tracking-wide uppercase">View crashed</p>

          <div class="bg-panel border border-error/30 rounded-lg p-4 flex flex-col gap-2">
            <p class="text-error font-mono text-sm font-semibold break-all">
              {{ capturedError.name }}: {{ capturedError.message }}
            </p>

            <p
              v-if="capturedVueInfo"
              class="text-textMuted font-mono text-xs"
            >
              Vue lifecycle: <span class="text-deepText">{{ capturedVueInfo }}</span>
            </p>

            <pre
              v-if="capturedError.stack"
              class="text-textMuted font-mono text-xs whitespace-pre-wrap break-all mt-1 max-h-64 overflow-auto"
            >{{ capturedError.stack }}</pre>
          </div>

          <BaseButton
            variant="ghost"
            icon="i-weui:back-outlined"
            class="self-start"
            data-testid="view-error-boundary-back-button"
            @click="handleBack"
          >
            Go back
          </BaseButton>
        </div>
      </template>

      <template v-else>
        <p class="text-textMuted text-sm">Something went wrong. Please try again.</p>

        <BaseButton
          variant="primary"
          icon="i-weui:back-outlined"
          data-testid="view-error-boundary-back-button"
          @click="handleBack"
        >
          Go back
        </BaseButton>
      </template>
    </div>
  </template>

  <slot v-else />
</template>

<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'
import { useRouter } from 'vue-router'
import BaseButton from '@/components/BaseButton.vue'
import { safeInject } from '@/safe-inject'
import { LOGGER_KEY } from '@/injection-keys'

const isNotProd = import.meta.env.MODE !== 'production'

const capturedError = ref<Error | undefined>(undefined)
const capturedVueInfo = ref<string | undefined>(undefined)

const logger = safeInject(LOGGER_KEY)
const router = useRouter()

onErrorCaptured((err, instance, info) => {
  capturedError.value = err instanceof Error ? err : new Error(String(err))
  capturedVueInfo.value = info

  logger.error('View error captured by ViewErrorBoundary', {
    vueInfo: info,
    componentName: instance?.$options?.name,
    error: err,
  })

  // Stop propagation — prevents the global app.config.errorHandler from also firing a toast
  return false
})

function handleBack(): void {
  capturedError.value = undefined
  capturedVueInfo.value = undefined
  router.back()
}
</script>
