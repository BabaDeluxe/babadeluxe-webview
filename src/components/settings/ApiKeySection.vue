<template>
  <section
    data-testid="api-providers-section"
    class="flex flex-col gap-4"
  >
    <h3 class="text-lg font-onest font-semibold text-deepText">API Keys</h3>
    <div
      v-for="provider in apiProviders"
      :key="provider.key"
      class="flex flex-col gap-1"
    >
      <BaseInput
        :model-value="fieldStates[provider.key].value"
        type="password"
        :label="provider.name"
        :placeholder="`Enter ${provider.name} API key...`"
        :is-required="provider.required"
        :validation-state="fieldStates[provider.key].status"
        :error="fieldStates[provider.key].error"
        :is-toggleable="true"
        :data-testid="`api-${provider.key}`"
        @update:model-value="(val) => $emit('api-key-input', provider.key, val)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import BaseInput from '@/components/BaseInput.vue'
import type { FieldState } from '@/composables/use-api-key-management'

type ApiProvider = {
  key: string
  name: string
  required: boolean
  description: string | undefined
}

defineProps<{
  apiProviders: ApiProvider[]
  fieldStates: Record<string, FieldState>
}>()

defineEmits<{
  (event: 'api-key-input', providerKey: string, value: string | number): void
}>()
</script>
