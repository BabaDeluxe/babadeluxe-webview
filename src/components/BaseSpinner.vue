<template>
  <div class="flex items-center gap-2">
    <div :class="sizeClass">
      <DotLottieVue
        :style="lottieStyle"
        autoplay
        loop
        :src="lottieBaseSpinnerUrl"
      />
    </div>
    <span
      v-if="message"
      :class="textClass"
    >
      {{ message }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { DotLottieVue } from '@lottiefiles/dotlottie-vue'
import { lottieBaseSpinnerUrl } from '@/constants'

interface BaseSpinnerProps {
  message?: string
  size?: 'small' | 'medium' | 'large'
  textClass?: string
}

const props = withDefaults(defineProps<BaseSpinnerProps>(), {
  message: undefined,
  size: 'medium',
  textClass: 'text-subtleText',
})

const sizeClass = computed(() => {
  const sizes = {
    small: 'w-5 h-5',
    medium: 'w-8 h-8',
    large: 'w-12 h-12',
  }
  return sizes[props.size]
})

const lottieStyle = computed(() => {
  const sizes = {
    small: 'height: 20px; width: 20px',
    medium: 'height: 32px; width: 32px',
    large: 'height: 48px; width: 48px',
  }
  return sizes[props.size]
})
</script>
