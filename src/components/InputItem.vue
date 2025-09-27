<template>
  <input
    v-model="myInput"
    type="text"
    :placeholder="placeholder"
    class="flex-1 bg-slate border border-gray-300 rounded border-2.5 px-3 py-2 text-base outline-none"
    autocomplete="off"
    @input="handleInput"
  >
</template>

<script setup lang="ts">
import { ref } from "vue";

const myInput = ref("");

defineProps({
  placeholder: String,
});

const emit = defineEmits(["update:value"]);

function handleInput() {
  emit("update:value", myInput.value);
}
</script>
