<template>
  <span
    class="inline-flex items-center gap-1.5 px-2 py-0.5 bg-accent/10 border border-accent/20 rounded-full text-xs text-accent font-medium select-none align-middle"
  >
    <span
      :class="iconClass"
      class="w-3 h-3"
    />
    <span>{{ item.label }}</span>
    <button
      type="button"
      class="hover:text-accent-hover transition-colors leading-none"
      @click.stop="emit('remove')"
    >
      <span class="i-hugeicons:cancel-01 w-3 h-3" />
    </button>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AtPickerItem } from '@/composables/use-at-picker'

const props = defineProps<{
  item: AtPickerItem
}>()

const emit = defineEmits<{
  remove: []
}>()

const iconClass = computed(() => {
  const { item } = props
  if (item.icon) return item.icon
  if (item.type === 'space') return 'i-hugeicons:folder-02'
  if (item.type === 'prompt') return 'i-hugeicons:quill-write-02'
  if (item.type === 'superpower') return 'i-hugeicons:flash'
  return ''
})
</script>
