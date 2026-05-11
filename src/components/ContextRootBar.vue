<template>
  <div
    class="relative flex flex-col gap-3 p-2 bg-panel rounded-lg border border-borderMuted shadow-sm"
  >
    <BaseButton
      variant="icon"
      type="button"
      icon=" i-bi:x-lg"
      class="absolute top-2.5 right-2.5 hover:bg-borderMuted/30 text-sm"
      aria-label="Hide context root bar"
      data-testid="context-root-bar-close"
      @click="$emit('hide')"
    />

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
        variant="menu"
        type="button"
        icon="i-bi:pencil-square"
        class="text-xs"
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
          class="px-2 py-1 text-xs font-mono text-subtleText overflow-x-auto whitespace-nowrap scrollbar-none"
        >
          {{ contextRootPath ?? 'Not set' }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import BaseButton from '@/components/BaseButton.vue'
import { VSCODE_BRIDGE_KEY } from '@/injection-keys'
import { safeInject } from '@/safe-inject'

defineProps<{
  contextRootPath: string | undefined
}>()

defineEmits<{
  hide: []
}>()

const bridge = safeInject(VSCODE_BRIDGE_KEY)

function pickContextRoot() {
  bridge.post({ command: 'pickContextRoot' })
}
</script>
