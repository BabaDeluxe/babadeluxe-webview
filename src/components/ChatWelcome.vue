<template>
  <div class="flex flex-col gap-0 px-4 py-6 w-full items-center">
    <slot name="avatar">
      <BaseAvatar
        v-if="showAvatar"
        role="user"
      />
    </slot>
    <div class="inline-flex h-full items-center justify-center text-xl text-deepText pt-2">
      <slot>
        {{ greeting }}
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import BaseAvatar from '@/components/BaseAvatar.vue'

interface EmptyStateProps {
  greeting?: string
  showAvatar?: boolean
}

withDefaults(defineProps<EmptyStateProps>(), {
  greeting: 'What can I help you with?',
  showAvatar: true,
})
</script>
