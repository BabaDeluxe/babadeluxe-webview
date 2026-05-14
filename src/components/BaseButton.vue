<template>
  <button
    ref="buttonRef"
    :class="computedClasses"
    :type="type"
    :disabled="isDisabled || isLoading"
    @click="$emit('click', $event)"
  >
    <template v-if="!isLoading">
      <i
        v-if="icon"
        :class="icon"
      />
      <slot v-if="text || $slots.default">
        <span class="hidden xs:inline-block">{{ text }}</span>
      </slot>
    </template>

    <template v-else>
      <slot
        v-if="$slots.loading"
        name="loading"
      />
      <i
        v-else
        class="i-svg-spinners:ring-resize text-base"
      />
    </template>
  </button>
</template>

<script setup lang="ts">
import { computed, ref, type PropType } from 'vue'
import { twMerge } from 'tailwind-merge'
import { type ButtonVariant, useButtonVariants } from '@/composables/use-button-variants'

const { getButtonClasses } = useButtonVariants()

const props = defineProps({
  text: { type: String, default: '' },
  icon: { type: String, default: '' },
  class: { type: String, default: '' },
  variant: {
    type: String as PropType<ButtonVariant>,
    default: 'primary',
  },
  type: {
    type: String as PropType<'button' | 'submit' | 'reset'>,
    default: 'button',
  },
  isDisabled: { type: Boolean, default: false },
  isLoading: { type: Boolean, default: false },
  isSelected: { type: Boolean, default: false },
})

defineEmits(['click'])

const buttonRef = ref<HTMLButtonElement>()

const computedClasses = computed(() => {
  const variantClasses = getButtonClasses(props.variant)

  const selectedClasses =
    props.isSelected && props.variant === 'icon'
      ? 'text-deepText'
      : props.isSelected
        ? 'bg-borderMuted text-deepText'
        : ''

  // Default to text-white for primary, text-deepText for others if not specified
  const defaultTextColor = props.variant === 'primary' ? 'text-white' : 'text-deepText'

  return twMerge(variantClasses, defaultTextColor, selectedClasses, props.class)
})
</script>
