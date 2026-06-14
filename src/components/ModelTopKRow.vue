<template>
  <div
    class="flex items-center gap-3 py-2 px-3 rounded-lg bg-surface hover:bg-surfaceHover transition-colors"
    :data-testid="`model-topk-row-${model.value}`"
  >
    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium text-deepText truncate">{{ model.label }}</p>
      <p class="text-xs text-subtleText">top_k</p>
    </div>

    <div class="flex items-center gap-2">
      <span
        class="text-xs text-subtleText w-20 text-right"
        :title="topKLabel(currentTopK)"
      >
        {{ currentTopK }} · {{ topKLabel(currentTopK) }}
      </span>

      <input
        type="range"
        :min="1"
        :max="500"
        :step="1"
        :value="currentTopK"
        class="w-28 accent-primary cursor-pointer"
        :aria-label="`top_k for ${model.label}`"
        @input="handleInput"
      />

      <button
        v-if="hasOverride"
        class="text-xs text-subtleText hover:text-deepText transition-colors px-1"
        title="Reset to provider default"
        @click="$emit('reset', model.value)"
      >
        ↺
      </button>
      <span
        v-else
        class="w-5"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { topKLabel } from '@/model-preferences'

const DEFAULT_TOP_K = 40

type Model = {
  label: string
  value: string
}

const props = defineProps<{
  model: Model
  topK: number | undefined
}>()

const emit = defineEmits<{
  (event: 'change', modelValue: string, value: number): void
  (event: 'reset', modelValue: string): void
}>()

const hasOverride = computed(() => props.topK !== undefined)
const currentTopK = computed(() => props.topK ?? DEFAULT_TOP_K)

function handleInput(event: Event): void {
  const value = parseInt((event.target as HTMLInputElement).value, 10)
  if (!Number.isNaN(value)) {
    emit('change', props.model.value, value)
  }
}
</script>
