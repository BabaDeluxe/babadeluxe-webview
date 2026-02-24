<template>
  <div
    class="group relative flex items-center gap-2.5 p-2 rounded-lg border text-sm transition-all duration-200 select-none"
    :class="[
      isPinned
        ? 'bg-accent/5 border-accent/30 hover:border-accent/40'
        : 'bg-panel border-borderMuted hover:border-borderMuted/60',
    ]"
    :title="fullTooltip"
  >
    <i
      v-if="icon"
      :class="[icon, isPinned ? 'text-accent' : 'text-subtleText']"
      class="text-base shrink-0 transition-colors duration-200"
      aria-hidden="true"
    />

    <div class="flex flex-col min-w-0 flex-1 leading-tight">
      <span class="text-deepText truncate font-medium text-sm">
        {{ title }}
      </span>

      <span
        v-if="subtitle"
        class="font-mono text-xs text-subtleText truncate mt-0.5"
      >
        {{ subtitle }}
      </span>
    </div>

    <div
      v-if="showActions"
      class="flex items-center gap-1 ml-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
    >
      <BaseButton
        type="button"
        :class="
          isPinned
            ? 'w-7 h-7 p-0 bg-transparent text-accent hover:bg-accent/10'
            : 'w-7 h-7 p-0 bg-transparent text-subtleText hover:text-accent hover:bg-accent/5'
        "
        :is-disabled="false"
        :aria-label="isPinned ? 'Unpin' : 'Pin'"
        @click.stop="$emit('toggle-pin')"
      >
        <i
          :class="isPinned ? 'i-bi:pin-fill' : 'i-bi:pin'"
          class="text-sm"
          aria-hidden="true"
        />
      </BaseButton>

      <BaseButton
        type="button"
        class="w-7 h-7 p-0 bg-transparent text-subtleText hover:text-error hover:bg-error/5"
        :is-disabled="false"
        aria-label="Remove"
        @click.stop="$emit('remove')"
      >
        <i
          class="i-bi:x-lg text-sm"
          aria-hidden="true"
        />
      </BaseButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import BaseButton from '@/components/BaseButton.vue'

withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    icon?: string
    isPinned?: boolean
    fullTooltip?: string
    showActions?: boolean
  }>(),
  {
    subtitle: undefined,
    icon: undefined,
    isPinned: false,
    fullTooltip: undefined,
    showActions: false,
  }
)

defineEmits<{
  remove: []
  'toggle-pin': []
}>()
</script>
