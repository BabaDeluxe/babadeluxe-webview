<template>
  <article
    :data-testid="`message-${id}`"
    class="flex gap-3 py-2 items-start rounded-lg px-2"
    :class="role === 'user' ? 'self-end flex-row-reverse' : 'self-start flex-row'"
  >
    <AvatarItem
      class="shrink-0 mt-1"
      :role="role"
    />
    <div class="flex flex-col gap-2 relative">
      <div
        class="flex rounded-lg px-4 py-3 text-sm whitespace-pre-wrap break-words relative transition-all duration-200"
        :class="bubbleClass"
      >
        <div
          v-if="!_isEditing"
          class="min-h-5 pr-6"
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
          data-testid="message-edit-textarea"
          :disabled="_isSaving"
          class="w-full bg-transparent resize-none outline-none border-none text-sm font-sans leading-relaxed pr-3 focus:ring-2 focus:ring-accent/20 rounded"
          :class="role === 'user' ? 'text-deepText' : 'text-subtleText'"
          @keydown="handleKeydown"
        />

        <!-- Edit Actions -->
        <div
          v-if="role === 'user' && _isEditing"
          class="flex flex-col gap-1 ml-2"
        >
          <button
            class="flex items-center justify-center w-7 h-7 rounded-md hover:bg-accent/20 text-accent transition-all duration-200 active:scale-95"
            :class="{ 'opacity-50 cursor-not-allowed': _isSaving }"
            :disabled="_isSaving"
            title="Save (Enter)"
            data-testid="message-save-button"
            @click="saveEdit"
          >
            <i
              v-if="!_isSaving"
              class="i-weui:done-outlined text-lg"
            />
            <i
              v-else
              class="i-svg-spinners:ring-resize text-lg"
            />
          </button>
          <button
            class="flex items-center justify-center w-7 h-7 rounded-md hover:bg-borderMuted/20 text-subtleText hover:text-deepText transition-all duration-200 active:scale-95"
            :class="{ 'opacity-50 cursor-not-allowed': _isSaving }"
            :disabled="_isSaving"
            title="Cancel (Esc)"
            data-testid="message-cancel-button"
            @click="cancelEdit"
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
            data-testid="message-menu-button"
            @click="toggle"
          >
            <i class="i-weui:more-outlined text-lg" />
          </button>

          <!-- Dropdown Menu -->
          <div
            v-if="isOpen"
            class="absolute top-full mt-1 right-0 bg-panel border border-borderMuted rounded-lg shadow-xl py-1 min-w-40 z-20 animate-in fade-in slide-in-from-top-2 duration-200"
            data-testid="message-menu-dropdown"
          >
            <!-- USER MESSAGES: Edit + Delete -->
            <template v-if="role === 'user'">
              <button
                class="w-full px-3 py-2.5 text-left text-sm hover:bg-codeBg text-subtleText hover:text-deepText transition-colors flex items-center gap-2.5 first:rounded-t-lg"
                data-testid="message-edit-button"
                @click="startEdit"
              >
                <i class="i-weui:pencil-outlined text-base" />
                <span>Edit Message</span>
              </button>

              <div class="border-t border-borderMuted my-1" />
            </template>

            <!-- ASSISTANT MESSAGES: Rewrite + Delete -->
            <template v-else-if="role === 'assistant'">
              <DropdownSelector
                v-model="_selectedModel"
                icon="i-fluent:arrow-repeat"
                :groups="_groupedModels"
                :disabled="_isLoadingModels"
                placement="right"
                data-testid="message-rewrite-selector"
                full-width
                trigger-class="w-full px-3 py-2.5 text-left text-sm hover:bg-codeBg text-subtleText hover:text-deepText transition-colors flex items-center gap-2.5 justify-between cursor-pointer rounded-t-lg"
                @update:model-value="onModelSelected"
              >
                <div class="flex items-center gap-2.5">
                  <i class="i-fluent:arrow-repeat text-base" />
                  <span v-if="_isLoadingModels">Loading models...</span>
                  <span v-else-if="_modelsError">Error loading models</span>
                  <span v-else>Rewrite with...</span>
                </div>
                <i class="i-weui:arrow-outlined rotate-90 text-xs opacity-50" />
              </DropdownSelector>

              <div class="border-t border-borderMuted my-1" />
            </template>

            <!-- Delete button for both roles -->
            <button
              class="w-full px-3 py-2.5 text-left text-sm hover:bg-codeBg text-subtleText hover:text-error transition-colors flex items-center gap-2.5 last:rounded-b-lg"
              data-testid="message-delete-button"
              @click="handleDelete"
            >
              <i class="i-weui:delete-outlined text-base" />
              <span>Delete Message</span>
            </button>
          </div>
        </div>
      </div>

      <ErrorBanner
        v-if="_errorMessage"
        :message="_errorMessage"
        @close="_errorMessage = ''"
      />
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { useTextareaAutosize } from '@vueuse/core'
import type { Message } from '@/database/types'
import { useDropdown } from '@/composables/use-dropdown'
import { useModelsSocket } from '@/composables/use-models-socket'
import MarkdownRenderItem from './MarkdownRenderItem.vue'
import AvatarItem from './AvatarItem.vue'
import DropdownSelector from './DropdownSelector.vue'
import ErrorBanner from './ErrorBanner.vue'

// TODO: Check the unused container ref
const { isOpen, containerRef, toggle, close } = useDropdown()
const { textarea: _textareaRef, input: _editValue } = useTextareaAutosize()
const {
  groupedModels: _rawGroupedModels,
  isLoadingModels: _isLoadingModels,
  modelsError: _modelsError,
} = useModelsSocket()

type ActiveChatItemEmitter = {
  delete: [id: number]
  update: [id: number, content: string]
  rewrite: [id: number, model: string]
}

const markdownRef = useTemplateRef<InstanceType<typeof MarkdownRenderItem>>('markdownRef')
defineExpose({ markdownRef })

const _isEditing = ref(false)
const _isSaving = ref(false)
const _errorMessage = ref('')
const _selectedModel = ref('')

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

// TODO It shouldn't send disabled, the models should be well-prepared server-side
// I think the update of the models if a model changes is also not handled already
const _groupedModels = computed(() =>
  _rawGroupedModels.value.map((group) => ({
    label: group.label,
    items: group.items.map((item) => ({
      value: item.value,
      label: item.label,
      icon: item.icon,
      disabled: item.disabled ?? false, // default
    })),
  }))
)

async function startEdit() {
  _editValue.value = props.content
  _isEditing.value = true
  close()
  await nextTick()
  _textareaRef.value?.focus()
}

function cancelEdit() {
  _isEditing.value = false
  _editValue.value = ''
  _isSaving.value = false
}

async function saveEdit() {
  if (_isSaving.value) return

  _isSaving.value = true
  _errorMessage.value = ''

  const trimmedValue = _editValue.value.trim()
  const isContentChanged = trimmedValue !== props.content && trimmedValue.length > 0

  if (!isContentChanged) {
    _isEditing.value = false
    _editValue.value = ''
    _isSaving.value = false
    return
  }

  emit('update', props.id, trimmedValue)

  _isEditing.value = false
  _editValue.value = ''
  _isSaving.value = false
}

async function handleDelete() {
  _errorMessage.value = ''
  emit('delete', props.id)
  close()
}
function handleKeydown(event: KeyboardEvent) {
  if (_isSaving.value) {
    event.preventDefault()
    return
  }

  const wasOnlyEnterPressed = event.key === 'Enter' && !event.ctrlKey && !event.shiftKey
  if (wasOnlyEnterPressed) {
    event.preventDefault()
    saveEdit()
    return
  }

  const wasEscapePressed = event.key === 'Escape'
  if (wasEscapePressed) {
    event.preventDefault()
    cancelEdit()
  }
}

function onModelSelected(modelId: string) {
  close() // Close the main menu
  emit('rewrite', props.id, modelId)
  _selectedModel.value = '' // Reset selection
}
</script>
