<template>
  <div
    class="group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors hover:bg-slate"
    :class="isActive ? 'bg-slate' : ''"
    role="button"
    :tabindex="0"
    :aria-current="isActive ? 'page' : undefined"
    @click="handleClick"
    @keydown.enter.prevent="handleClick"
    @keydown.space.prevent="handleClick"
  >
    <div class="flex-1 min-w-0 flex flex-col gap-0.5">
      <span class="text-xs font-medium text-deepText truncate leading-snug">
        {{ title }}
      </span>
      <span
        v-if="subtitle"
        class="text-xs text-subtleText truncate leading-snug"
      >
        {{ subtitle }}
      </span>
    </div>

    <div
      class="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 shrink-0 transition-opacity"
    >
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
interface ConversationListItemProps {
  title: string
  subtitle?: string
  isActive?: boolean
}

defineProps<ConversationListItemProps>()

const emit = defineEmits<{
  click: []
}>()

function handleClick() {
  emit('click')
}
</script>
