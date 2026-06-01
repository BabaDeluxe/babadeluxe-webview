<template>
  <section
    data-testid="appearance-section"
    class="flex flex-col gap-4"
  >
    <h2 class="text-xl font-onest font-semibold text-deepText">Appearance</h2>
    <div
      class="flex items-center justify-between p-3 border border-borderMuted rounded-lg bg-panel"
    >
      <div class="flex flex-col">
        <span class="text-deepText font-medium">Dark Mode</span>
        <span class="text-xs text-subtleText">Toggle application theme</span>
      </div>
      <BaseButton
        variant="ghost"
        :icon="isDark ? 'i-bi:moon-stars-fill' : 'i-bi:sun-fill'"
        :text="isDark ? 'Dark' : 'Light'"
        @click="$emit('toggle-theme')"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import BaseButton from '@/components/BaseButton.vue'

defineProps<{
  isDark: boolean
}>()

defineEmits<{
  (event: 'toggle-theme'): void
}>()
</script>
