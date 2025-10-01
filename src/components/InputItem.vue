<template><input :value="value" type="text" :placeholder="placeholder" :disabled="disabled"
  class="flex-1 bg-panel border border-borderMuted rounded-md px-3 py-2 text-base outline-none text-deepText placeholder-subtleText focus:border-accent transition-colors"
  autocomplete="off" @input="handleInput" @keydown="$emit('keydown', $event)"></template>

<script setup lang="ts">
// ✅ Fix: Proper v-model implementation
defineProps({
  placeholder: {
    type: String,
    default: ''
  },
  value: {
    type: String,
    default: ''
  },
  disabled: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:value', 'input', 'keydown']);

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement;
  emit('update:value', target.value);
  emit('input', target.value);
}
</script>
