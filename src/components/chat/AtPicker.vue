<template>
  <div
    v-if="items.length > 0"
    ref="listRef"
    class="absolute bottom-full left-0 mb-2 w-64 max-h-64 overflow-y-auto bg-panel border border-borderMuted rounded-lg shadow-xl z-[9999] py-2"
  >
    <div v-for="group in groupedItems" :key="group.type">
      <div class="px-3 py-1 text-[10px] uppercase tracking-wider text-subtleText font-bold">
        {{ group.label }}
      </div>
      <ul>
        <li
          v-for="(item, index) in group.items"
          :key="item.id"
          class="px-3 py-2 flex items-center gap-2 text-sm cursor-default transition-colors"
          :class="{
            'bg-surfaceDynamic text-accent is-active': items.indexOf(item) === activeIndex,
            'text-deepText': items.indexOf(item) !== activeIndex
          }"
        >
          <span :class="getIcon(item)" class="w-4 h-4 opacity-70" />
          <span class="flex-1 truncate">{{ item.label }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, nextTick, useTemplateRef } from 'vue'
import type { AtPickerItem } from '@/composables/use-at-picker'

const props = defineProps<{
  items: AtPickerItem[]
  activeIndex: number
}>()

const listRef = useTemplateRef<HTMLElement>('listRef')

const groupedItems = computed(() => {
  const groups: Record<string, AtPickerItem[]> = {
    space: [],
    prompt: [],
    superpower: [],
  }
  props.items.forEach((item) => {
    groups[item.type].push(item)
  })
  return [
    { label: 'Spaces', type: 'space', items: groups.space },
    { label: 'Prompts', type: 'prompt', items: groups.prompt },
    { label: 'Superpowers', type: 'superpower', items: groups.superpower },
  ].filter((g) => g.items.length > 0)
})

watch(() => props.activeIndex, async () => {
  await nextTick()
  const activeItemElement = listRef.value?.querySelector('.is-active')
  if (activeItemElement) {
    activeItemElement.scrollIntoView({ block: 'nearest' })
  }
})

const getIcon = (item: AtPickerItem) => {
  if (item.icon) return item.icon
  if (item.type === 'space') return 'i-hugeicons:folder-02'
  if (item.type === 'prompt') return 'i-hugeicons:quill-write-02'
  if (item.type === 'superpower') return 'i-hugeicons:flash'
  return ''
}
</script>

<style scoped>
.bg-surfaceDynamic {
  background-color: var(--color-surface-dynamic, rgba(var(--color-accent-rgb), 0.1));
}
</style>
