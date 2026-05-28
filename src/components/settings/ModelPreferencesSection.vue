<template>
  <section
    data-testid="model-preferences-section"
    class="flex flex-col gap-4"
  >
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-onest font-semibold text-deepText">Model Preferences</h2>
      <span class="text-xs text-subtleText"
        >Temperature controls generation randomness (0 = precise, 2 = wild)</span
      >
    </div>

    <div
      v-if="availableModels.length === 0"
      class="text-sm text-subtleText"
    >
      No models available. Make sure an API key is configured.
    </div>

    <div
      v-else
      class="flex flex-col gap-2"
    >
      <ModelTemperatureRow
        v-for="model in availableModels"
        :key="model.value"
        :model="model"
        :temperature="getTemperatureForModel(model.value)"
        @change="(val, temp) => $emit('temperature-change', val, temp)"
        @reset="(val) => $emit('temperature-reset', val)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import ModelTemperatureRow from '@/components/ModelTemperatureRow.vue'

type Model = {
  label: string
  value: string
}

defineProps<{
  availableModels: Model[]
  getTemperatureForModel: (modelValue: string) => number | undefined
}>()

defineEmits<{
  (event: 'temperature-change', modelValue: string, value: number): void
  (event: 'temperature-reset', modelValue: string): void
}>()
</script>
