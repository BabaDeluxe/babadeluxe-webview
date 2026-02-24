<template>
  <div
    class="relative flex flex-col gap-3 p-2 bg-panel rounded-lg border border-borderMuted shadow-sm"
  >
    <BaseButton
      type="button"
      variant="icon"
      class="absolute top-2.5 right-2.5 text-subtleText hover:text-deepText hover:bg-borderMuted/30"
      :is-disabled="false"
      aria-label="Hide context root bar"
      data-testid="context-root-bar-close"
      @click="$emit('hide')"
    >
      <i
        class="i-bi:x-lg text-sm"
        aria-hidden="true"
      />
    </BaseButton>

    <div class="flex items-center justify-between gap-3 pr-8">
      <div class="flex items-center gap-2.5 min-w-0">
        <span
          class="i-bi:folder2-open text-accent text-lg shrink-0"
          aria-hidden="true"
        />
        <span class="hidden mobile:inline text-sm font-onest font-semibold text-deepText">
          Context Root Path
        </span>
      </div>
      <BaseButton
        type="button"
        variant="ghost"
        class="border border-borderMuted text-subtleText hover:text-deepText hover:bg-borderMuted/20 text-xs px-3 py-1.5"
        :is-disabled="false"
        icon="i-bi:pencil-square"
        aria-label="Change context root path"
        data-testid="context-root-bar-change"
        @click="pickContextRoot"
      >
        <span class="hidden mobile:inline">Change…</span>
      </BaseButton>
    </div>

    <div class="flex items-start gap-2 min-w-0">
      <span class="hidden mobile:inline text-xs font-onest text-subtleText/70 shrink-0 mt-0.5">
        Path:
      </span>
      <div class="flex-1 min-w-0 rounded-lg border border-borderMuted/50 bg-codeBg overflow-hidden">
        <div
          class="px-2 py-1 text-xs font-mono text-subtleText overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-borderMuted scrollbar-track-transparent"
          :title="displayRoot"
        >
          {{ displayRoot }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useEventListener } from '@vueuse/core'
import BaseButton from '@/components/BaseButton.vue'
import { useVsCodeContextStore } from '@/stores/use-vs-code-context-store'
import { getVsCodeApi } from '@/vs-code/api'
import { storeToRefs } from 'pinia'

type IncomingMessage =
  | { type: 'contextRoot.current'; root: string | null }
  | { type: string; [key: string]: unknown }

defineEmits<{
  hide: []
}>()

const contextRoot = ref<string | null>(null)
const vsCodeContext = useVsCodeContextStore()
const { isInVsCode } = storeToRefs(vsCodeContext)

const displayRoot = computed(() => contextRoot.value ?? 'Not set')

function handleVsCodeMessage(event: MessageEvent): void {
  const message = event.data as IncomingMessage
  if (message?.type === 'contextRoot.current') contextRoot.value = message.root as string | null
}

function pickContextRoot(): void {
  const apiResult = getVsCodeApi()
  if (apiResult.isErr()) return
  apiResult.value.postMessage({ type: 'contextRoot.pick' })
}

function requestCurrentContextRoot(): void {
  const apiResult = getVsCodeApi()
  if (apiResult.isErr()) return
  apiResult.value.postMessage({ type: 'contextRoot.getCurrent' })
}

useEventListener(window, 'message', handleVsCodeMessage)

watch(
  isInVsCode,
  (value) => {
    if (!value) return
    requestCurrentContextRoot()
  },
  { immediate: true }
)
</script>
