<template>
  <article
    class="flex w-full gap-3 py-3"
    :class="role === 'user' ? 'justify-end' : 'justify-start'"
  >
    <AvatarItem v-if="role === 'assistant'" class="shrink-0" />

    <div class="flex flex-col gap-2">
      <div
        class="rounded-lg px-4 py-2 text-sm whitespace-pre-wrap break-words relative"
        :class="bubbleClass"
      >
        <div v-if="!_isEditing" class="min-h-5">
          <slot>
            <MarkdownRenderer
              :content="content"
              :cursor="isStreaming && role === 'assistant'"
            />
          </slot>
        </div>

        <textarea
          v-else
          ref="_textareaRef"
          v-model="_editValue"
          class="w-full min-h-20 bg-transparent resize-none outline-none border-none text-sm"
          :class="role === 'user' ? 'text-deepText' : 'text-subtleText'"
          @keydown="_handleKeydown"
        ></textarea>
      </div>

      <div
        class="flex items-center gap-1 opacity-0 hover:opacity-100 transition-opacity duration-200"
      >
        <template v-if="_isEditing">
          <button
            class="flex items-center justify-center w-6 h-6 rounded text-xs bg-accent hover:bg-accentHover text-white transition-colors"
            @click="_saveEdit"
          >
            <i class="i-weui:done-outlined"></i>
          </button>
          <button
            class="flex items-center justify-center w-6 h-6 rounded text-xs bg-panel hover:bg-borderMuted text-subtleText transition-colors"
            @click="_cancelEdit"
          >
            <i class="i-weui:close-outlined"></i>
          </button>
        </template>

        <template v-else>
          <button
            class="flex items-center justify-center w-6 h-6 rounded text-xs hover:bg-panel text-subtleText hover:text-accent transition-colors"
            @click="_startEdit"
          >
            <i class="i-weui:pencil-outlined"></i>
          </button>
          <button
            class="flex items-center justify-center w-6 h-6 rounded text-xs hover:bg-panel text-subtleText hover:text-error transition-colors"
            @click="_handleDelete"
          >
            <i class="i-weui:delete-outlined"></i>
          </button>
        </template>
      </div>
    </div>

    <AvatarItem v-if="role === 'user'" class="shrink-0 order-last" />
  </article>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import AvatarItem from "./AvatarItem.vue";
import MarkdownRenderer from "./MarkdownRenderItem.vue";

import { type Message } from "@babadeluxe/shared";
import { type ConversationItemEmitter } from "@babadeluxe/shared";
import { db } from "../database/db";

const props = defineProps<Message>();
const emit = defineEmits<ConversationItemEmitter>();

const bubbleClass = computed(() => {
  if (props.role === "user")
    return "bg-panel text-deepText border border-borderMuted";
  if (props.role === "assistant")
    return "bg-codeBg text-subtleText border border-borderMuted";
  throw new Error(`Unsupported role "${props.role}"`);
});

const _isEditing = ref(false);
const _editValue = ref("");
const _textareaRef = ref<HTMLTextAreaElement>();

async function _startEdit() {
  _editValue.value = props.content;
  _isEditing.value = true;
  await nextTick();
  _textareaRef.value?.focus();
}

function _cancelEdit() {
  _isEditing.value = false;
  _editValue.value = "";
}

async function _saveEdit() {
  const trimmedValue = _editValue.value.trim();
  if (trimmedValue !== props.content && trimmedValue.length > 0) {
    try {
      await db.updateMessage(props.id, trimmedValue);
      emit("update", props.id, trimmedValue);
    } catch (error) {
      console.trace("Failed to update message:", error);
    }
  }
  _isEditing.value = false;
  _editValue.value = "";
}

async function _handleDelete() {
  try {
    await db.deleteMessage(props.id);
    emit("delete", props.id);
  } catch (error) {
    console.trace("Failed to delete message:", error);
  }
}

function _handleKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.ctrlKey && !event.shiftKey) {
    event.preventDefault();
    _saveEdit();
  } else if (event.key === "Escape") {
    event.preventDefault();
    _cancelEdit();
  }
}
</script>

<style scoped>
textarea {
  font-family: inherit;
  line-height: inherit;
}
</style>
