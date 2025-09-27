<template>
  <article
    class="flex w-full gap-3 py-3"
    :class="role === 'user' ? 'justify-end' : 'justify-start'"
  >
    <AvatarItem
      v-if="role === 'assistant'"
      class="shrink-0"
    />

    <div class="flex flex-col gap-2 max-w-full">
      <div
        class="rounded-lg px-4 py-2 text-sm whitespace-pre-wrap break-words relative"
        :class="bubbleClass"
      >
        <div
          v-if="!_isEditing"
          class="min-h-5"
        >
          <slot>
            <MarkdownRenderItem
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
        />
      </div>
    </div>

    <div
      class="flex items-center gap-1 opacity-0 hover:opacity-100 transition-opacity duration-200"
    >
      <template v-if="_isEditing">
        <button
          class="flex items-center justify-center w-6 h-6 rounded text-xs bg-accent hover:bg-accentHover text-white transition-colors"
          @click="_saveEdit"
        >
          <i class="i-weui:done-outlined" />
        </button>
        <button
          class="flex items-center justify-center w-6 h-6 rounded text-xs bg-panel hover:bg-borderMuted text-subtleText transition-colors"
          @click="_cancelEdit"
        >
          <i class="i-weui:close-outlined" />
        </button>
      </template>

      <template v-else>
        <button
          class="flex items-center justify-center w-6 h-6 rounded text-xs hover:bg-panel text-subtleText hover:text-accent transition-colors"
          @click="_startEdit"
        >
          <i class="i-weui:pencil-outlined" />
        </button>
        <div class="relative">
          <button
            class="flex items-center justify-center w-6 h-6 rounded text-xs hover:bg-panel text-subtleText hover:text-accent transition-colors"
            @click="_toggleModelDropdown"
          >
            <i class="i-weui:circle-outlined" />
          </button>
          <div
            v-if="_showModelDropdown"
            class="absolute bottom-full mb-2 left-0 bg-panel border border-borderMuted roudned-lg shadhow-lg py-1 min-w-32 z-10"
          >
            <button
              v-for="model in _availableModels"
              :key="model.id"
              class="w-full px-3 py-2 text-left text-sm hover:bg-codeBg text-subtleText hover:text-deepText transition-colors flex items-center gap-2"
              @click="_selectModel(model)"
            >
              <i class="i-weui:circle-outlined" />
            </button>
          </div>
        </div>

        <button
          class="flex items-center justify-center w-6 h-6 rounded text-xs hover:bg-panel text-subtleText hover:text-error transition-colors"
          @click="_handleDelete"
        >
          <i class="i-weui:delete-outlined" />
        </button>
      </template>
    </div>
  </article>
</template>

<script setup lang="ts">
import MarkdownRenderItem from "./MarkdownRenderItem.vue";
import AvatarItem from "./AvatarItem.vue";
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { db } from "../database/db";
import { KeyValueStore } from '../database/key-value-store'
import type { ActiveChatItemEmitter } from "@babadeluxe/shared";
import type { Message } from "@babadeluxe/shared";
import type { ModelOption } from "@babadeluxe/shared";
import { KeyValueDb } from '@/database/key-value-db';

const props = withDefaults(defineProps<Message>(), {
  isStreaming: false,
});

const emit = defineEmits<ActiveChatItemEmitter>();

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
const _showModelDropdown = ref(false);
const _selectedModel = ref("gpt-4");
const _keyValueStore = ref<KeyValueStore>();

const _availableModels: ModelOption[] = [
  { id: "gpt-4", name: "GPT-4", icon: "i-simple-icons:openai" },
  { id: "gpt-3.5", name: "GPT-3.5", icon: "i-simple-icons:openai" },
  { id: "claude-3", name: "Claude 3", icon: "i-simple-icons:anthropic" },
  { id: "gemini", name: "Gemini", icon: "i-simple-icons:google" },
];

onMounted(async () => {
  const keyValueDb = new KeyValueDb();
  _keyValueStore.value = new KeyValueStore(keyValueDb);

  const savedModel = await _keyValueStore.value.get("selectedModel");
  if (savedModel) {
    _selectedModel.value = savedModel;
  }

  document.addEventListener("click", _handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", _handleClickOutside);
});

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

function _toggleModelDropdown() {
  _showModelDropdown.value = !_showModelDropdown.value;
}

async function _selectModel(model: ModelOption) {
  _selectedModel.value = model.id;
  _showModelDropdown.value = false;

  if (_keyValueStore.value) {
    await _keyValueStore.value.set("selectedModel", model.id);
  }
  emit("rewrite", props.id, model.id);
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

function _handleClickOutside(event: Event) {
  const target = event.target as HTMLElement;
  if (!target.closest(".relative")) {
    _showModelDropdown.value = false;
  }
}
</script>
