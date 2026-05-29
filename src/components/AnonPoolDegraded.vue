<template>
  <div class="flex flex-col items-center justify-center p-8 text-center gap-6 bg-panel rounded-xl border border-borderMuted max-w-md mx-auto my-12">
    <div class="i-bi:cloud-slash text-4xl text-warning/60" />
    <div class="space-y-2">
      <h3 class="text-lg font-semibold text-deepText">AI is busy</h3>
      <p class="text-subtleText text-sm leading-relaxed">
        Our free AI is a little busy right now. Sign up for guaranteed access, or try again in a moment.
      </p>
    </div>
    <div class="flex flex-col w-full gap-2">
      <BaseButton
        variant="primary"
        class="w-full"
        @click="goToRegister"
      >
        Create free account →
      </BaseButton>
      <BaseButton
        variant="ghost"
        class="w-full"
        @click="emit('retry')"
      >
        Try again
      </BaseButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import BaseButton from './BaseButton.vue'

const router = useRouter()
const emit = defineEmits(['retry'])

const goToRegister = () => {
  router.push({ name: 'register' })
}
</script>
