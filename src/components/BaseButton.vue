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
import { computed, onMounted, ref, useAttrs } from 'vue'
import { mergeUnoClasses } from '@/merge-uno-classes'
import { type ButtonVariant, useButtonVariants } from '@/composables/use-button-variants'

defineOptions({ inheritAttrs: false })

interface BaseButtonProps {
  text?: string
  icon?: string
  variant?: ButtonVariant
  type?: 'button' | 'submit' | 'reset'
  isDisabled?: boolean
  isLoading?: boolean
  isSelected?: boolean
  ariaLabel?: string
}

const props = withDefaults(defineProps<BaseButtonProps>(), {
  text: '',
  icon: '',
  variant: 'primary',
  type: 'button',
  isDisabled: false,
  isLoading: false,
  isSelected: false,
  ariaLabel: '',
})

defineEmits<{
  click: [event: MouseEvent]
}>()

const { getButtonClasses } = useButtonVariants()

const buttonRef = ref<HTMLButtonElement>()

const attrs = useAttrs()

const computedClasses = computed(() => {
  const variantClasses = getButtonClasses(props.variant)

  const selectedClasses =
    props.isSelected && props.variant === 'icon'
      ? // Icon variant: highlight text only — no background fill on selection
        // to preserve the transparent/borderless icon button appearance.
        'text-deepText'
      : props.isSelected
        ? 'bg-borderMuted text-deepText'
        : ''

  const defaultTextColor = props.variant === 'primary' ? 'text-white' : 'text-deepText'

  return mergeUnoClasses(variantClasses, defaultTextColor, selectedClasses, attrs.class as string)
})

if (import.meta.env.DEV) {
  onMounted(() => {
    const hasVisibleLabel = props.text || buttonRef.value?.textContent?.trim()
    if (props.icon && !hasVisibleLabel && !props.ariaLabel) {
      console.warn(
        '[BaseButton] Icon-only button is missing an accessible label. ' +
          'Add ariaLabel="..." to describe the button action.',
        buttonRef.value
      )
    }
  })
}
</script>
