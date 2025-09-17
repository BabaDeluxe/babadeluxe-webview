<template>
  <div
    class="flex gap-3"
    :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
  >
    <div class="max-w-2xl flex flex-col">
      <div class="flex items-center gap-2 mb-1">
        <i
          :class="message.role === 'user' ? 'i-weui:friends' : 'i-weui:service'"
          class="text-sm"
        ></i>
        <span
          class="text-xs font-medium"
          :class="message.role === 'user' ? 'text-blue-300' : 'text-green-300'"
        >
          {{ message.role === "user" ? "You" : "Assistant" }}
        </span>
        <time class="text-xs text-gray-500">{{
          formatTime(message.timestamp)
        }}</time>
      </div>
      <div
        class="rounded-lg px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words"
        :class="
          message.role === 'user'
            ? 'bg-purple-600 text-white'
            : 'bg-gray-700 text-gray-100'
        "
      >
        {{ message.content }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Message } from "@babadeluxe/shared";

interface Props {
  message: Message;
}

defineProps<Props>();

const formatTime = (date: Date) => {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
};
</script>
