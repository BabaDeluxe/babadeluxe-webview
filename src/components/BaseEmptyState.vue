<template>
  <div class="flex flex-col items-center justify-center p-8 text-subtleText">
    <slot name="icon">
      <i
        v-if="icon"
        :class="[icon, iconSizeClass, 'mb-4 opacity-50']"
      />
    </slot>
    <h3
      v-if="title"
      class="text-lg font-medium mb-2 text-deepText"
    >
      {{ title }}
    </h3>
    <p
      v-if="description"
      class="text-sm"
    >
      {{ description }}
    </p>
    <slot />
  </div>
</template>

<script setup lang="ts">
interface BaseEmptyStateProps {
  icon?: string
  title?: string
  description?: string
  iconSize?: 'small' | 'medium' | 'large'
}

const props = withDefaults(defineProps<BaseEmptyStateProps>(), {
  icon: undefined,
  title: undefined,
  description: undefined,
  iconSize: 'large',
})

const iconSizeClass = {
  small: 'text-4xl',
  medium: 'text-5xl',
  large: 'text-6xl',
}[props.iconSize]
</script>
