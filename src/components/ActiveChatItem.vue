<template>
  <article
    class="group flex w-full gap-3 py-3"
    :class="role === 'user' ? 'justify-start flex-row' : 'justify-end flex-row-reverse'"
  >
    <!-- Avatar: Shown for both, positioned left for user / right for bot -->
    <AvatarItem class="shrink-0" />

    <div class="flex flex-col gap-2 max-w-[80%] relative">
      <div
        class="rounded-lg px-4 py-2 text-sm whitespace-pre-wrap break-words relative"
        :class="bubbleClass"
      >
        <!-- Message Content -->
        <div
          v-if="!_isEditing"
          class="min-h-5 pr-8"
        >
          <slot>
            <MarkdownRenderItem
              :content="content"
              :cursor="isStreaming && role === 'assistant'"
            />
          </slot>
        </div>

        <!-- Edit Mode -->
        <textarea
          v-else
          ref="_textareaRef"
          v-model="_editValue"
          class="w-full min-h-20 bg-transparent resize-none outline-none border-none text-sm pr-8"
          :class="role === 'user' ? 'text-deepText' : 'text-subtleText'"
          @keydown="_handleKeydown"
        />

        <!-- Burger Menu - Always Visible -->
        <div class="absolute top-2 right-2">
          <button
            class="flex items-center justify-center w-6 h-6 rounded hover:bg-borderMuted/20 text-subtleText hover:text-deepText transition-colors"
            @click="_toggleOptionsMenu"
          >
            <i class="i-weui:more-outlined" />  <!-- Three dots icon -->
          </button>

          <!-- Options Dropdown -->
          <div
            v-if="_showOptionsMenu"
            class="absolute top-full mt-1 right-0 bg-panel border border-borderMuted rounded-lg shadow-lg py-1 min-w-36 z-20"
            :class="role === 'user' ? 'right-0' : 'left-0'"
          >
            <!-- Edit Mode Options -->
            <template v-if="_isEditing">
              <button
                class="w-full px-3 py-2 text-left text-sm hover:bg-codeBg text-deepText hover:text-accent transition-colors flex items-center gap-2"
                @click="_saveEdit"
              >
                <i class="i-weui:done-outlined text-accent" />
                <span>Save Changes</span>
              </button>
              <button
                class="w-full px-3 py-2 text-left text-sm hover:bg-codeBg text-subtleText hover:text-deepText transition-colors flex items-center gap-2"
                @click="_cancelEdit"
              >
                <i class="i-weui:close-outlined" />
                <span>Cancel</span>
              </button>
            </template>

            <!-- Normal Mode Options -->
            <template v-else>
              <button
                class="w-full px-3 py-2 text-left text-sm hover:bg-codeBg text-subtleText hover:text-deepText transition-colors flex items-center gap-2"
                @click="_startEdit"
              >
                <i class="i-weui:pencil-outlined" />
                <span>Edit Message</span>
              </button>

              <!-- Model Rewrite Submenu -->
              <div class="relative">
                <button
                  class="w-full px-3 py-2 text-left text-sm hover:bg-codeBg text-subtleText hover:text-deepText transition-colors flex items-center gap-2 justify-between"
                  @click="_toggleModelSubmenu"
                >
                  <div class="flex items-center gap-2">
                    <i class="i-simple-icons:openai" />
                    <span>Rewrite with...</span>
                  </div>
                  <i class="i-weui:arrow-outlined rotate-90 text-xs" />
                </button>

                <!-- Model Selection Submenu -->
                <div
                  v-if="_showModelSubmenu"
                  class="absolute left-full top-0 ml-1 bg-panel border border-borderMuted rounded-lg shadow-lg py-1 min-w-32 z-30"
                >
                  <button
                    v-for="model in _availableModels"
                    :key="model.id"
                    class="w-full px-3 py-2 text-left text-sm hover:bg-codeBg text-subtleText hover:text-deepText transition-colors flex items-center gap-2"
                    @click="_selectModel(model)"
                  >
                    <i
                      :class="model.icon"
                      class="text-xs"
                    />
                    <span>{{ model.name }}</span>
                  </button>
                </div>
              </div>

              <!-- Divider -->
              <div class="border-t border-borderMuted my-1" />

              <!-- Delete Option -->
              <button
                class="w-full px-3 py-2 text-left text-sm hover:bg-codeBg text-subtleText hover:text-error transition-colors flex items-center gap-2"
                @click="_handleDelete"
              >
                <i class="i-weui:delete-outlined" />
                <span>Delete Message</span>
              </button>
            </template>
          </div>
        </div>
      </div>
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
const _showOptionsMenu = ref(false);
const _showModelSubmenu = ref(false);
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

function _toggleOptionsMenu() {
  _showOptionsMenu.value = !_showOptionsMenu.value;
  _showModelSubmenu.value = false; // Close submenu when toggling main menu
}

function _toggleModelSubmenu() {
  _showModelSubmenu.value = !_showModelSubmenu.value;
}

async function _startEdit() {
  _editValue.value = props.content;
  _isEditing.value = true;
  _showOptionsMenu.value = false;
  await nextTick();
  _textareaRef.value?.focus();
}

function _cancelEdit() {
  _isEditing.value = false;
  _editValue.value = "";
  _showOptionsMenu.value = false;
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
  _showOptionsMenu.value = false;
}

async function _handleDelete() {
  try {
    await db.deleteMessage(props.id);
    emit("delete", props.id);
  } catch (error) {
    console.trace("Failed to delete message:", error);
  }
  _showOptionsMenu.value = false;
}

async function _selectModel(model: ModelOption) {
  _selectedModel.value = model.id;
  _showOptionsMenu.value = false;
  _showModelSubmenu.value = false;

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
    _showOptionsMenu.value = false;
    _showModelSubmenu.value = false;
  }
}
</script>
