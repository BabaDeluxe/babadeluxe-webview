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
import { computed, ref, onMounted, onUnmounted, nextTick, watch, type PropType } from 'vue'
import { parse, wcagContrast } from 'culori'
import { twMerge } from 'tailwind-merge'
import { type ButtonVariant, useButtonVariants } from '@/composables/use-button-variants'
import { logger } from '@/logger'

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
  allowTextOverride: { type: Boolean, default: false },
})

defineEmits(['click'])

const buttonRef = ref<HTMLButtonElement>()
const autoTextColor = ref<'text-white' | 'text-black'>('text-white')

let rootObserver: MutationObserver | undefined
let buttonObserver: MutationObserver | undefined

function calculateContrastColor(): void {
  if (!buttonRef.value) return

  const computedStyle = window.getComputedStyle(buttonRef.value)
  const backgroundColor = computedStyle.backgroundColor

  const parsedBackground = parse(backgroundColor)
  logger.log('Parsed background color:', parsedBackground)
  if (!parsedBackground) {
    autoTextColor.value = 'text-white'
    return
  }

  const whiteContrast = wcagContrast(parsedBackground, '#ffffff')
  const blackContrast = wcagContrast(parsedBackground, '#000000')

  autoTextColor.value = whiteContrast >= blackContrast ? 'text-white' : 'text-black'
}

function scheduleContrastUpdate(): void {
  nextTick(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        calculateContrastColor()
      })
    })
  })
}

onMounted(async () => {
  if (!buttonRef.value) return

  await nextTick()
  requestAnimationFrame(() => {
    calculateContrastColor()
  })

  const rootElement = document.documentElement
  rootObserver = new MutationObserver(() => {
    scheduleContrastUpdate()
  })

  rootObserver.observe(rootElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme'],
  })

  buttonObserver = new MutationObserver(() => {
    scheduleContrastUpdate()
  })

  if (buttonRef.value) {
    buttonObserver.observe(buttonRef.value, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    })
  }
})

onUnmounted(() => {
  rootObserver?.disconnect()
  buttonObserver?.disconnect()
  rootObserver = undefined
  buttonObserver = undefined
})

const computedClasses = computed(() => {
  const variantClasses = getButtonClasses(props.variant)

  const selected = props.isSelected
    ? props.variant === 'icon'
      ? 'text-deepText' // icon: only text color changes when selected
      : 'bg-borderMuted text-deepText'
    : ''

  const userClasses = props.class

  let merged = twMerge(variantClasses, selected, userClasses)

  const hasAnyTextClass =
    /text-(white|black|deepText|subtleText|accent|error|success|warning)/.test(merged)

  if (props.allowTextOverride && hasAnyTextClass) {
    return merged
  }

  if (!props.allowTextOverride && hasAnyTextClass) {
    merged = merged
      .split(' ')
      .filter(
        (cls) => !/^text-(white|black|deepText|subtleText|accent|error|success|warning)$/.test(cls)
      )
      .join(' ')
  }

  return twMerge(merged, autoTextColor.value)
})

watch(
  () => props.class,
  () => {
    scheduleContrastUpdate()
  },
  { flush: 'post' }
)
</script>
