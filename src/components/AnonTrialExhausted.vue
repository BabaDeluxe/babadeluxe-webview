<template>
  <div class="sticky top-0 z-50 w-full bg-panel border-b border-borderMuted p-4 flex items-center justify-between gap-4 animate-fade-in">
    <div class="flex items-center gap-3">
      <div class="i-bi:exclamation-circle text-accent text-xl shrink-0" />
      <p class="text-sm text-subtleText">
        You've used your 10 free messages. Create a free account to keep going — no credit card needed.
      </p>
    </div>
    <BaseButton
      variant="primary"
      size="sm"
      @click="goToRegister"
    >
      Create free account →
    </BaseButton>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import BaseButton from './BaseButton.vue'

const router = useRouter()

const goToRegister = () => {
  router.push({ name: 'register' })
}

onMounted(() => {
  localStorage.setItem('anon-trial-exhausted', 'true')
})
</script>
