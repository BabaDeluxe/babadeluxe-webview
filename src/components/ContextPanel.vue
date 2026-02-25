<template>
  <div class="flex flex-col gap-3">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2 min-w-0">
        <BaseButton
          variant="ghost"
          type="button"
          :icon="isCollapsed ? 'i-bi:chevron-right' : 'i-bi:chevron-down'"
          :is-disabled="items.length === 0"
          :aria-expanded="!isCollapsed"
          aria-label="Toggle context visibility"
          aria-hidden="true"
          @click="isCollapsed = !isCollapsed"
        >
        </BaseButton>

        <span class="text-xs font-onest font-semibold text-deepText tracking-wide">
          BabaContext™
        </span>

        <BaseButton
          variant="ghost"
          type="button"
          icon="i-bi:folder2-open"
          :class="isRootBarVisible ? 'text-accent bg-accent/10' : ''"
          :aria-pressed="isRootBarVisible"
          aria-label="Toggle context root path"
          aria-hidden="true"
          @click="$emit('toggleRootBar')"
        />
      </div>

      <BaseButton
        variant="ghost"
        type="button"
        class="text-xs px-2 py-1 hover:text-error hover:bg-error/5"
        :is-disabled="items.length === 0"
        text="Clear all"
        @click="$emit('clearAll')"
      />
    </div>

    <!-- Collapsed state -->
    <div
      v-if="isCollapsed && items.length > 0"
      class="text-xs text-subtleText px-1 shrink-0"
    >
      {{ items.length }} {{ items.length === 1 ? 'item' : 'items' }} hidden
    </div>

    <!-- Content list with scroll -->
    <div
      v-else-if="items.length > 0"
      class="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-borderMuted scrollbar-track-transparent shrink-0"
    >
      <ContextBadge
        v-for="item in items"
        :key="item.id"
        :title="displayMap.get(item.filePath) ?? item.filePath"
        :subtitle="formatLocation(item)"
        :full-tooltip="item.filePath"
        :is-pinned="item.kind === 'pinned'"
        :show-actions="true"
        icon="i-bi:file-earmark-code"
        @toggle-pin="$emit('togglePin', item.filePath)"
        @remove="$emit('removeItem', item.id)"
      />
    </div>

    <!-- Empty state -->
    <div
      v-else
      class="text-xs text-subtleText/60 text-center py-4 px-2 shrink-0"
    >
      No context items yet
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseButton from '@/components/BaseButton.vue'
import ContextBadge from '@/components/ContextBadge.vue'
import type { VsCodeContextItem } from '@/stores/use-vs-code-context-store'
import { getDisambiguatedPaths } from '@/path-disambiguation'

const props = defineProps<{
  items: VsCodeContextItem[]
  isLoading: boolean
  hasError: boolean
  isRootBarVisible: boolean
}>()

defineEmits<{
  removeItem: [itemId: string]
  clearAll: []
  togglePin: [filePath: string]
  toggleRootBar: []
}>()

const isCollapsed = ref(false)

const displayMap = computed(() => {
  const paths = props.items.map((i) => i.filePath)
  return getDisambiguatedPaths(paths)
})

function formatLocation(item: VsCodeContextItem): string | undefined {
  if (!item.matchRange) return undefined

  const { startLine, endLine, startCharacter, endCharacter } = item.matchRange
  const lineA = startLine + 1
  const lineB = endLine + 1

  if (startLine !== endLine) {
    return `L${lineA}:C${startCharacter + 1} → L${lineB}:C${endCharacter + 1}`
  }
  return `L${lineA}:C${startCharacter + 1}-${endCharacter + 1}`
}
</script>
