<template>
  <article
    class="flex gap-3 py-2 items-start rounded-lg px-2 -mx-2 max-w-[80%]"
    :class="role === 'user' ? 'self-end flex-row-reverse' : 'self-start flex-row'"
  >
    <AvatarItem
      class="shrink-0 mt-1"
      :role="role"
    />
    <div class="flex flex-col gap-2 max-w-[80%] relative">
      <div
        class="flex rounded-lg px-4 py-3 text-sm whitespace-pre-wrap break-words relative transition-all duration-200"
        :class="bubbleClass"
      >
        <div
          v-if="!_isEditing"
          class="min-h-5 pr-8"
        >
          <slot>
            <MarkdownRenderItem
              ref="markdownRef"
              :content="content"
              :cursor="isStreaming && role === 'assistant'"
              :is-streaming="isStreaming"
            />
          </slot>
        </div>

        <textarea
          v-else
          ref="_textareaRef"
          v-model="_editValue"
          class="w-full bg-transparent resize-none outline-none border-none text-sm font-sans leading-relaxed pr-3 focus:ring-2 focus:ring-accent/20 rounded"
          :class="role === 'user' ? 'text-deepText' : 'text-subtleText'"
          @keydown="_handleKeydown"
        />

        <!-- Edit Actions -->
        <div
          v-if="role === 'user' && _isEditing"
          class="flex flex-col gap-1 ml-2"
        >
          <button
            class="flex items-center justify-center w-7 h-7 rounded-md hover:bg-accent/20 text-accent transition-all duration-200 active:scale-95"
            title="Save (Enter)"
            @click="_saveEdit"
          >
            <i class="i-weui:done-outlined text-lg" />
          </button>
          <button
            class="flex items-center justify-center w-7 h-7 rounded-md hover:bg-borderMuted/20 text-subtleText hover:text-deepText transition-all duration-200 active:scale-95"
            title="Cancel (Esc)"
            @click="_cancelEdit"
          >
            <i class="i-weui:close-outlined text-lg" />
          </button>
        </div>

        <!-- Menu Button -->
        <div
          v-if="!_isEditing"
          ref="containerRef"
          class="absolute top-2 right-2"
        >
          <button
            class="flex items-center justify-center w-7 h-7 rounded-md hover:bg-borderMuted/20 text-subtleText hover:text-deepText transition-all duration-200 active:scale-95"
            :class="{ 'bg-borderMuted/20': isOpen }"
            @click="toggle"
          >
            <i class="i-weui:more-outlined text-lg" />
          </button>

          <!-- Dropdown Menu -->
          <div
            v-if="isOpen"
            class="absolute top-full mt-1 right-0 bg-panel border border-borderMuted rounded-lg shadow-xl py-1 min-w-40 z-20 animate-in fade-in slide-in-from-top-2 duration-200"
          >
            <!-- Only show edit/rewrite for user messages -->
            <template v-if="role === 'user'">
              <button
                class="w-full px-3 py-2.5 text-left text-sm hover:bg-codeBg text-subtleText hover:text-deepText transition-colors flex items-center gap-2.5 first:rounded-t-lg"
                @click="_startEdit"
              >
                <i class="i-weui:pencil-outlined text-base" />
                <span>Edit Message</span>
              </button>

              <div
                v-if="showRewrite"
                class="hover:bg-codeBg hover:text-deepText"
              >
                <DropdownSelector
                  v-model="_selectedModel"
                  :icon="'i-simple-icons:openai'"
                  :items="
                    _availableModels.map((model) => ({
                      value: model.id,
                      label: model.name,
                      icon: model.icon,
                    }))
                  "
                  placement="bottom"
                  @update:model-value="_onModelSelected"
                >
                  <div
                    class="w-full px-3 py-2.5 text-left text-sm text-subtleText transition-colors flex items-center gap-2.5 justify-between"
                  >
                    <div class="flex items-center gap-2.5">
                      <i class="i-simple-icons:openai text-base" />
                      <span>Rewrite with...</span>
                    </div>
                    <i class="i-weui:arrow-outlined rotate-90 text-xs opacity-50" />
                  </div>
                </DropdownSelector>
              </div>

              <div class="border-t border-borderMuted my-1" />
            </template>

            <!-- Delete button for both roles -->
            <button
              class="w-full px-3 py-2.5 text-left text-sm hover:bg-codeBg text-subtleText hover:text-error transition-colors flex items-center gap-2.5 last:rounded-b-lg"
              @click="_handleDelete"
            >
              <i class="i-weui:delete-outlined text-base" />
              <span>Delete Message</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onMounted, ref, useTemplateRef } from 'vue'
import { useTextareaAutosize } from '@vueuse/core'
import type { Message, ModelOption } from '@babadeluxe/shared'
import { type KeyValueStore } from '../database/key-value-store'
import MarkdownRenderItem from './MarkdownRenderItem.vue'
import AvatarItem from './AvatarItem.vue'
import DropdownSelector from './DropdownSelector.vue'
import { APP_DB_KEY, KEY_VALUE_STORE_KEY, LOGGER_KEY } from '@/injection-keys'
import { type AppDb } from '@/database/app-db'
import { useDropdown } from '@/composables/use-dropdown-state'
import { type ConsoleLogger } from '@simwai/utils'
import { type ActiveChatItemEmitter } from '@/types/active-chat-item-types'

const _appDb: AppDb = inject(APP_DB_KEY)!
const _keyValueStore: KeyValueStore = inject(KEY_VALUE_STORE_KEY)!
const _logger: ConsoleLogger = inject(LOGGER_KEY)!

const { isOpen, containerRef, toggle, close } = useDropdown()
const { textarea: _textareaRef, input: _editValue } = useTextareaAutosize()

const _availableModels: ModelOption[] = [
  {
    id: 'gpt-4',
    name: 'GPT-4',
    icon: 'i-simple-icons:openai',
  },
  {
    id: 'gpt-3.5',
    name: 'GPT-3.5',
    icon: 'i-simple-icons:openai',
  },
  {
    id: 'claude-3',
    name: 'Claude 3',
    icon: 'i-simple-icons:anthropic',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    icon: 'i-simple-icons:google',
  },
]

const _isEditing = ref(false)
const _defaultModel = _availableModels[0].name
const _selectedModel = ref(_defaultModel)
const markdownRef = useTemplateRef<InstanceType<typeof MarkdownRenderItem>>('markdownRef')

defineExpose({ markdownRef })

const props = withDefaults(defineProps<Message & { showRewrite?: boolean }>(), {
  isStreaming: false,
  showRewrite: true,
})

const emit = defineEmits<ActiveChatItemEmitter>()

const bubbleClass = computed(() => {
  if (props.role === 'user') return 'bg-panel text-deepText border border-borderMuted'
  if (props.role === 'assistant') return 'bg-codeBg text-subtleText border border-borderMuted'
  throw new Error(`Unsupported role "${props.role}"`)
})

async function _startEdit() {
  _editValue.value = props.content
  _isEditing.value = true
  close()
  await nextTick()
  _textareaRef.value?.focus()
}

function _cancelEdit() {
  _isEditing.value = false
  _editValue.value = ''
}

async function _saveEdit() {
  const trimmedValue = _editValue.value.trim()

  if (trimmedValue !== props.content && trimmedValue.length > 0) {
    try {
      await _appDb.updateMessage(props.id, trimmedValue)
      emit('update', props.id, trimmedValue)
    } catch (error) {
      _logger.trace('Failed to update message:', error as Error)
    }
  }

  _isEditing.value = false
  _editValue.value = ''
}

async function _handleDelete() {
  try {
    await _appDb.deleteMessage(props.id)
    emit('delete', props.id)
  } catch (error) {
    // TODO Add neverthrow error handling to app db to avoid such unlean stuff
    if (error instanceof Error) _logger.trace('Failed to delete message:', error)
    else _logger.trace('Failed to delete message')
  }

  close()
}

async function _selectModel(model: ModelOption) {
  _selectedModel.value = model.id
  close()

  if (_keyValueStore) {
    await _keyValueStore.set('selected-rewrite-model', model.id)
  }

  emit('rewrite', props.id, model.id)
}

function _handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.ctrlKey && !event.shiftKey) {
    event.preventDefault()
    _saveEdit()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    _cancelEdit()
  }
}

function _onModelSelected(id: string) {
  const model = _availableModels.find((model) => model.id === id)
  if (model) _selectModel(model)
}

onMounted(async () => {
  _selectedModel.value = (await _keyValueStore.get('selected-rewrite-model')) || _defaultModel
})
</script>
