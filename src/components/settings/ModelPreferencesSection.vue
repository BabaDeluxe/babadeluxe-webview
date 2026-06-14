<template>
  <section
    data-testid="model-preferences-section"
    class="flex flex-col gap-4"
  >
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-onest font-semibold text-deepText">Model Preferences</h2>
      <span class="text-xs text-subtleText">
        Control generation sampling: temperature (randomness), top_p (nucleus), top_k (vocab)
      </span>
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
      <template
        v-for="model in availableModels"
        :key="model.value"
      >
        <ModelTemperatureRow
          :model="model"
          :temperature="getTemperatureForModel(model.value)"
          @change="(val, temp) => $emit('temperature-change', val, temp)"
          @reset="(val) => $emit('temperature-reset', val)"
        />
        <ModelTopPRow
          :model="model"
          :top-p="getTopPForModel(model.value)"
          @change="(val, topP) => $emit('top-p-change', val, topP)"
          @reset="(val) => $emit('top-p-reset', val)"
        />
        <ModelTopKRow
          :model="model"
          :top-k="getTopKForModel(model.value)"
          @change="(val, topK) => $emit('top-k-change', val, topK)"
          @reset="(val) => $emit('top-k-reset', val)"
        />
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import ModelTemperatureRow from '@/components/ModelTemperatureRow.vue'
import ModelTopPRow from '@/components/ModelTopPRow.vue'
import ModelTopKRow from '@/components/ModelTopKRow.vue'

type Model = {
  label: string
  value: string
}

defineProps<{
  availableModels: Model[]
  getTemperatureForModel: (modelValue: string) => number | undefined
  getTopPForModel: (modelValue: string) => number | undefined
  getTopKForModel: (modelValue: string) => number | undefined
}>()

defineEmits<{
  (event: 'temperature-change', modelValue: string, value: number): void
  (event: 'temperature-reset', modelValue: string): void
  (event: 'top-p-change', modelValue: string, value: number): void
  (event: 'top-p-reset', modelValue: string): void
  (event: 'top-k-change', modelValue: string, value: number): void
  (event: 'top-k-reset', modelValue: string): void
}>()
</script>
