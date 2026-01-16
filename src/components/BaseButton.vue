<template>
  <button
    class="cursor-pointer"
    :class="mergedClasses"
    :type="type"
    :disabled="disabled || loading"
    @click="$emit('click', $event)"
  >
    <slot v-if="!loading && $slots.default" />
    <template v-else-if="!loading">
      <i
        v-if="icon"
        :class="icon"
      />
      <span v-if="text">{{ text }}</span>
    </template>
    <slot
      v-else-if="loading && $slots.loading"
      name="loading"
    />
    <i
      v-else
      class="i-svg-spinners:ring-resize text-xl"
    />
  </button>
</template>

<script setup lang="ts">
import { computed, type PropType } from 'vue'
import { mergeTailwindClasses } from '@/tailwind-class-merger'

const props = defineProps({
  text: { type: String, default: '' },
  icon: { type: String, default: '' },
  class: { type: String, default: '' },
  type: {
    type: String as PropType<'button' | 'submit' | 'reset'>,
    default: 'button',
  },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
})

defineEmits(['click'])

const baseClasses =
  'w-auto h-auto sm:h-10 bg-accent rounded text-slate hover:bg-accentHover transition-colors font-bold p-1.5 md:p-2 inline-flex justify-center items-center gap-1.5'

const mergedClasses = computed(() => mergeTailwindClasses(baseClasses, props.class))
</script>
