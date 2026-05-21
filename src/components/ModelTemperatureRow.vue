<template>
  <div
    class="flex items-center gap-3 p-3 rounded-lg border border-borderMuted bg-panel"
    :data-testid="`temperature-row-${model.value}`"
  >
    <div class="flex flex-col flex-1 min-w-0">
      <span class="text-sm font-medium text-deepText truncate">{{ model.label }}</span>
      <span class="text-xs text-subtleText">{{ model.value }}</span>
    </div>

    <div class="flex items-center gap-2 flex-shrink-0 w-44">
      <input
        type="range"
        min="0"
        max="2"
        step="0.05"
        :value="localTemp"
        class="flex-1 accent-accent h-1 cursor-pointer"
        :data-testid="`temperature-slider-${model.value}`"
        @input="handleSliderInput"
        @change="handleSliderCommit"
      />
      <span
        class="text-xs font-semibold text-accent bg-accentDim border border-accentBorder rounded px-2 py-0.5 min-w-[3.5rem] text-center tabular-nums"
      >
        {{ displayValue }}
      </span>
    </div>

    <BaseButton
      v-if="isOverridden"
      variant="ghost"
      icon="i-bi:arrow-counterclockwise"
      title="Use provider default"
      :data-testid="`temperature-reset-${model.value}`"
      @click="$emit('reset', model.value)"
    />
    <div
      v-else
      class="w-8 flex-shrink-0"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { temperatureLabel } from '@/model-preferences'
import BaseButton from '@/components/BaseButton.vue'

interface Model {
  label: string
  value: string
}

interface Props {
  model: Model
  temperature?: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  change: [modelValue: string, temperature: number]
  reset: [modelValue: string]
}>()

const localTemp = ref(props.temperature)

watch(
  () => props.temperature,
  (val) => {
    localTemp.value = val
  }
)

const isOverridden = computed(() => props.temperature !== undefined)

const displayValue = computed(() => {
  if (props.temperature === undefined) return 'Provider default'
  return `${localTemp?.value?.toFixed(2)} · ${temperatureLabel(localTemp?.value ?? 0.4)}`
})

function handleSliderInput(event: Event) {
  localTemp.value = Number((event.target as HTMLInputElement).value)
}

function handleSliderCommit(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  emit('change', props.model.value, value)
}
</script>
