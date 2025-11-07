<template>
  <button
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

const props = defineProps({
  text: {
    type: String,
    default: '',
  },
  icon: {
    type: String,
    default: '',
  },
  class: {
    type: String,
    default: '',
  },
  type: {
    type: String as PropType<'button' | 'submit' | 'reset'>,
    default: 'button',
    validator: (value: string) => ['button', 'submit', 'reset'].includes(value),
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  loading: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['click'])

const conflictGroups = {
  width: ['w-'],
  height: ['h-'],
  backgroundColor: ['bg-'],
  borderRadius: ['rounded'],
  display: ['block', 'inline-block', 'flex', 'inline-flex', 'grid', 'hidden'],
  color: ['text-'],
  justify: ['justify-'],
  items: ['items-'],
  fontWeight: [
    'font-thin',
    'font-light',
    'font-normal',
    'font-medium',
    'font-semibold',
    'font-bold',
  ],
  padding: ['p-', 'px-', 'py-', 'pt-', 'pb-', 'pl-', 'pr-'],
  transition: ['transition-'],
}

const _extractBaseClass = (className: string): string => {
  return className.includes(':') ? className.split(':', 2)[1] : className
}

const _getConflictGroup = (className: string): string | null => {
  const baseClass = _extractBaseClass(className)

  for (const [groupName, prefixes] of Object.entries(conflictGroups)) {
    if (prefixes.some((prefix) => baseClass.startsWith(prefix) || baseClass === prefix)) {
      return groupName
    }
  }

  return null
}

const _resolveClassConflictsWithResponsive = (
  baseClasses: string,
  styleClasses: string
): string => {
  const base = baseClasses.split(' ').filter(Boolean)
  const style = styleClasses.split(' ').filter(Boolean)

  const overriddenGroups = new Set<string>()

  for (const styleClass of style) {
    const group = _getConflictGroup(styleClass)
    if (group) {
      overriddenGroups.add(group)
    }
  }

  const filteredBase = base.filter((baseClass) => {
    const group = _getConflictGroup(baseClass)
    return !group || !overriddenGroups.has(group)
  })

  return [...filteredBase, ...style].join(' ')
}

const mergedClasses = computed(() => {
  const baseClasses =
    'w-auto h-auto sm:h-10 bg-accent rounded text-slate hover:bg-accentHover transition-colors font-bold p-1.5 md:p-2 inline-flex justify-center items-center gap-1.5'

  return _resolveClassConflictsWithResponsive(baseClasses, props.class)
})
</script>
