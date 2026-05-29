<template>
  <div
    v-if="cancelAtPeriodEnd"
    class="flex items-start gap-4 p-4 rounded-lg bg-panel border border-warning"
  >
    <div class="flex-shrink-0 pt-0.5">
      <i class="i-bi:exclamation-triangle text-warning text-xl" />
    </div>

    <div class="flex-1 flex flex-col gap-1">
      <div class="text-deepText font-medium">
        Your {{ tierName }} subscription ends on {{ formattedEndDate }}.
      </div>
      <div class="text-subtleText text-sm">After this date you'll be moved to the Hobby plan.</div>
    </div>

    <BaseButton
      variant="secondary"
      class="flex-shrink-0"
      @click="$emit('reactivate')"
    >
      Reactivate →
    </BaseButton>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BaseButton from '@/components/BaseButton.vue'
import { formatTierName } from '@/settings-utils'

const props = defineProps<{
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: string | null
  tier: string | null
}>()

defineEmits<{
  reactivate: []
}>()

const tierName = computed(() => formatTierName(props.tier))

const formattedEndDate = computed(() => {
  if (!props.currentPeriodEnd) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(props.currentPeriodEnd))
})
</script>
