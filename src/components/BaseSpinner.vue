<template>
  <div
    class="flex items-center gap-2"
    role="status"
    :aria-label="message ?? 'Loading'"
  >
    <i class="i-svg-spinners:ring-resize text-accent" />
    <span
      v-if="message"
      class="text-sm text-subtleText"
    >
      {{ message }}
    </span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  message?: string
}>()
</script>
