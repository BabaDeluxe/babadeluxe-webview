<template>
  <div
    class="flex flex-col items-center justify-center p-12 text-subtleText transition-all duration-300"
    :class="[hasBorder ? 'border border-borderMuted/20 border-dashed rounded-3xl bg-panel/5 shadow-inner' : '']"
  >
    <div class="relative mb-6">
      <slot name="icon">
        <i
          v-if="icon"
          :class="[icon, iconSizeClass, 'relative z-10 opacity-60 text-accent']"
        />
        <div class="absolute inset-0 blur-2xl bg-accent/20 rounded-full scale-150" v-if="icon" />
      </slot>
    </div>

    <h3
      v-if="title"
      class="text-xl font-onest font-semibold mb-3 text-deepText tracking-tight text-center"
    >
      {{ title }}
    </h3>

    <p
      v-if="description"
      class="text-sm text-center max-w-sm leading-relaxed text-subtleText/80"
    >
      {{ description }}
    </p>

    <p
      v-if="subDescription"
      class="text-xs mt-3 text-center opacity-60 font-mono"
    >
      {{ subDescription }}
    </p>

    <div class="mt-8">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
interface BaseEmptyStateProps {
  icon?: string
  title?: string
  description?: string
  subDescription?: string
  iconSize?: 'small' | 'medium' | 'large'
  hasBorder?: boolean
}

const props = withDefaults(defineProps<BaseEmptyStateProps>(), {
  icon: undefined,
  title: undefined,
  description: undefined,
  subDescription: undefined,
  iconSize: 'large',
  hasBorder: false,
})

const iconSizeClass = {
  small: 'text-4xl',
  medium: 'text-5xl',
  large: 'text-6xl',
}[props.iconSize]
</script>
