<template>
  <div
    class="flex items-center gap-3 py-2 px-3 rounded-lg bg-surface hover:bg-surfaceHover transition-colors"
    :data-testid="`model-reasoning-effort-row-${model.value}`"
  >
    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium text-deepText truncate">{{ model.label }}</p>
      <p class="text-xs text-subtleText">reasoning effort</p>
    </div>

    <div class="flex items-center gap-2">
      <div class="flex rounded-md overflow-hidden border border-border">
        <button
          v-for="option in options"
          :key="option.value"
          class="px-2 py-1 text-xs transition-colors"
          :class="
            currentEffort === option.value
              ? 'bg-primary text-primaryText font-semibold'
              : 'bg-surface text-subtleText hover:bg-surfaceHover hover:text-deepText'
          "
          :aria-label="`Set reasoning effort to ${option.label} for ${model.label}`"
          :aria-pressed="currentEffort === option.value"
          @click="handleSelect(option.value)"
        >
          {{ option.label }}
        </button>
      </div>

      <button
        v-if="hasOverride"
        class="text-xs text-subtleText hover:text-deepText transition-colors px-1"
        title="Reset to auto (model default)"
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
import type { ReasoningEffort } from '@babadeluxe/shared'

type EffortOption = {
  value: ReasoningEffort | 'auto'
  label: string
}

const options: EffortOption[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'off', label: 'Off' },
  { value: 'minimal', label: 'Min' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Med' },
  { value: 'high', label: 'High' },
]

type Model = {
  label: string
  value: string
}

const props = defineProps<{
  model: Model
  /** undefined means no user override — display as Auto */
  reasoningEffort: ReasoningEffort | undefined
}>()

const emit = defineEmits<{
  (event: 'change', modelValue: string, value: ReasoningEffort): void
  (event: 'reset', modelValue: string): void
}>()

const hasOverride = computed(() => props.reasoningEffort !== undefined)
const currentEffort = computed<ReasoningEffort | 'auto'>(() => props.reasoningEffort ?? 'auto')

function handleSelect(value: ReasoningEffort | 'auto'): void {
  if (value === 'auto') {
    emit('reset', props.model.value)
  } else {
    emit('change', props.model.value, value)
  }
}
</script>
