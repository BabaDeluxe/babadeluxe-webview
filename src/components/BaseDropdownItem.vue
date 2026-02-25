<template>
  <div
    :class="[
      'flex items-center gap-2 px-4 py-2 text-sm text-deepText transition-colors',
      isActive ? 'bg-slate' : 'hover:bg-slate',
      isDisabled ? 'opacity-60 cursor-default' : 'cursor-pointer',
      itemClass,
    ]"
    @click="handleClick"
  >
    <i
      v-if="icon"
      :class="icon"
      class="text-xs"
      aria-hidden="true"
    />
    <div
      v-if="subtitle"
      class="flex flex-col"
    >
      <span>{{ label }}</span>
      <span class="text-xs text-subtleText">
        {{ subtitle }}
      </span>
    </div>
    <span v-else>
      {{ label }}
    </span>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  value: string
  label: string
  icon?: string
  subtitle?: string
  isActive?: boolean
  isDisabled?: boolean
  itemClass?: string
}>()

const emit = defineEmits<{
  (event: 'select', value: string): void
}>()

function handleClick(): void {
  if (props.isDisabled) return
  emit('select', props.value)
}
</script>
