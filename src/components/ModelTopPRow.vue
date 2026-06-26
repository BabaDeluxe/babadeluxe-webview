<template>
  <div
    class="flex items-center gap-3 py-2 px-3 rounded-lg bg-surface hover:bg-surfaceHover transition-colors"
    :data-testid="`model-topp-row-${model.value}`"
  >
    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium text-deepText truncate">{{ model.label }}</p>
      <p class="text-xs text-subtleText">top_p</p>
    </div>

    <div class="flex items-center gap-2">
      <span
        class="text-xs text-subtleText w-16 text-right"
        :title="topPLabel(currentTopP)"
      >
        {{ currentTopP.toFixed(2) }} · {{ topPLabel(currentTopP) }}
      </span>

      <input
        type="range"
        :min="0"
        :max="1"
        :step="0.05"
        :value="currentTopP"
        class="w-28 accent-primary cursor-pointer"
        :aria-label="`top_p for ${model.label}`"
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
import { topPLabel } from '@/model-preferences'

const defaultTopP = 1

type Model = {
  label: string
  value: string
}

const props = defineProps<{
  model: Model
  topP: number | undefined
}>()

const emit = defineEmits<{
  (event: 'change', modelValue: string, value: number): void
  (event: 'reset', modelValue: string): void
}>()

const hasOverride = computed(() => props.topP !== undefined)
const currentTopP = computed(() => props.topP ?? defaultTopP)

function handleInput(event: Event): void {
  const value = parseFloat((event.target as HTMLInputElement).value)
  if (!Number.isNaN(value)) {
    emit('change', props.model.value, value)
  }
}
</script>
