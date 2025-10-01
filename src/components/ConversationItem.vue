<template>
<article class="flex w-full gap-3 py-3" :class="role === 'user' ? 'justify-end' : 'justify-start'">
  <AvatarItem v-if="role === 'assistant'" class="shrink-0" />

  <div class="flex flex-col gap-2">
    <div class="rounded-lg px-4 py-2 text-sm whitespace-pre-wrap break-words relative" :class="bubbleClass">
      <div v-if="!_isEditing" class="min-h-5">
        <slot>
          <MarkdownRenderer :content="content" :cursor="isStreaming && role === 'assistant'" />
        </slot>
      </div>

      <textarea v-else ref="_textareaRef" v-model="_editValue"
        class="w-full min-h-20 bg-transparent resize-none outline-none border-none text-sm"
        :class="role === 'user' ? 'text-deepText' : 'text-subtleText'" @keydown="_handleKeydown"
        @input="_handleAutoSave" />
    </div>

    <!-- Message Status and Timestamp -->
    <div class="flex items-center justify-between text-xs text-subtleText">
      <span>{{ formatTimestamp(timestamp) }}</span>
      <div v-if="role === 'user'" class="flex items-center gap-1">
        <i v-if="status === 'sent'" class="i-weui:done-outlined text-accent" />
        <i v-else-if="status === 'pending'" class="i-weui:time-outlined" />
        <i v-else-if="status === 'error'" class="i-weui:close-outlined text-error" />
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="flex items-center gap-1 opacity-0 hover:opacity-100 transition-opacity duration-200">
      <template v-if="_isEditing">
        <button
          class="flex items-center justify-center w-6 h-6 rounded text-xs bg-accent hover:bg-accentHover text-white transition-colors"
          @click="_saveEdit">
          <i class="i-weui:done-outlined" />
        </button>
        <button
          class="flex items-center justify-center w-6 h-6 rounded text-xs bg-panel hover:bg-borderMuted text-subtleText transition-colors"
          @click="_cancelEdit">
          <i class="i-weui:close-outlined" />
        </button>
      </template>

      <template v-else>
        <button
          class="flex items-center justify-center w-6 h-6 rounded text-xs hover:bg-panel text-subtleText hover:text-accent transition-colors"
          @click="_startEdit">
          <i class="i-weui:pencil-outlined" />
        </button>
        <button
          class="flex items-center justify-center w-6 h-6 rounded text-xs hover:bg-panel text-subtleText hover:text-error transition-colors"
          @click="_handleDelete">
          <i class="i-weui:delete-outlined" />
        </button>
      </template>
    </div>
  </div>

  <AvatarItem v-if="role === 'user'" class="shrink-0" />
</article>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useOnline, useDebounceFn } from '@vueuse/core';
import AvatarItem from "./AvatarItem.vue";
import MarkdownRenderer from "./MarkdownRenderItem.vue";
import type { Message } from "@babadeluxe/shared";

interface ConversationItemProps extends Message {
  isStreaming?: boolean;
  status?: 'pending' | 'sent' | 'error';
}

const props = withDefaults(defineProps<ConversationItemProps>(), {
  isStreaming: false,
  status: 'sent'
});

const emit = defineEmits<{
  delete: [messageId: number];
  update: [messageId: number, content: string];
  autoSave: [messageId: number, content: string];
}>();

const isOnline = useOnline();

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

// Create local debounced auto-save that emits to parent
const _debouncedAutoSave = useDebounceFn((id: number, content: string) => {
  emit('autoSave', id, content);
}, 500, { maxWait: 2000 });

const formatTimestamp = (timestamp: Date) => {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp));
};

const _handleAutoSave = () => {
  if (_editValue.value.trim() && _editValue.value !== props.content && isOnline.value) {
    _debouncedAutoSave(props.id, _editValue.value);
  }
};

async function _startEdit() {
  if (!isOnline.value) {
    console.warn('Cannot edit while offline');
    return;
  }

  _editValue.value = props.content;
  _isEditing.value = true;
  await nextTick();
  _textareaRef.value?.focus();
}

function _cancelEdit() {
  _isEditing.value = false;
  _editValue.value = "";
}

function _saveEdit() {
  const trimmedValue = _editValue.value.trim();
  if (trimmedValue !== props.content && trimmedValue.length > 0 && isOnline.value) {
    emit("update", props.id, trimmedValue);
  }
  _isEditing.value = false;
  _editValue.value = "";
}

function _handleDelete() {
  if (!isOnline.value) {
    console.warn('Cannot delete while offline');
    return;
  }
  emit("delete", props.id);
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
