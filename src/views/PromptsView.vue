<template>
  <section
    id="prompts"
    class="relative flex flex-col w-full h-full overflow-hidden bg-slate"
  >
    <!-- Header -->
    <div class="flex flex-row w-full items-center justify-between gap-2 px-4 pt-4 flex-shrink-0">
      <h3 class="text-lg font-medium text-deepText">All Prompts</h3>
      <ButtonItem
        icon="i-bi:plus-circle"
        @click="handleCreateNewPrompt"
      >
        New Prompt
      </ButtonItem>
    </div>

    <!-- Loading State -->
    <div
      v-if="isLoading"
      class="flex-1 flex justify-center items-center"
    >
      <div class="flex items-center gap-2 text-subtleText">
        <div
          class="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"
        />
        <span>Loading prompts...</span>
      </div>
    </div>

    <!-- Error State -->
    <div
      v-else-if="error"
      class="flex-1 flex flex-col justify-center items-center text-error p-4"
    >
      <i class="i-weui:error-outlined text-4xl mb-2"></i>
      <p>{{ error }}</p>
      <ButtonItem
        class="mt-4"
        @click="fetchAllPrompts"
        >Retry</ButtonItem
      >
    </div>

    <!-- Main Content -->
    <div
      v-else
      class="flex-1 overflow-hidden px-4 pb-4 pt-4"
    >
      <!-- Mobile: Vertical stack -->
      <div
        ref="verticalContainerRef"
        class="flex flex-col md:hidden h-full"
      >
        <!-- Top Pane: Prompts List -->
        <div
          class="flex flex-col gap-2 overflow-y-auto"
          :style="{ height: verticalTopHeightPercent }"
        >
          <div
            v-for="prompt in prompts"
            :key="prompt.id"
            class="flex items-center justify-between p-3 border border-borderMuted rounded-md hover:bg-panel cursor-pointer transition-colors"
            :class="{ 'bg-accent/10 border-accent': prompt.id === selectedPromptId }"
            @click="selectedPromptId = prompt.id"
          >
            <div class="flex-1 min-w-0">
              <div class="font-medium text-deepText truncate">{{ prompt.name }}</div>
              <div class="text-sm text-subtleText truncate">/{{ prompt.command }}</div>
            </div>
          </div>
          <div
            v-if="prompts.length === 0"
            class="text-center text-subtleText p-8"
          >
            No prompts created yet. <br />
            Click "New Prompt" to start.
          </div>
        </div>

        <!-- Resizer Handle -->
        <div
          class="relative flex items-center justify-center cursor-row-resize group flex-shrink-0"
          :class="{ 'bg-accent/10': verticalIsDragging }"
          @mousedown="verticalStartDragging"
        >
          <div
            class="h-0.5 w-12 rounded-full transition-all"
            :class="
              verticalIsDragging
                ? 'bg-accent w-16'
                : 'bg-borderMuted group-hover:bg-accent group-hover:w-16'
            "
          />
        </div>

        <!-- Bottom Pane: Prompt Editor -->
        <div
          class="flex flex-col gap-4 overflow-y-auto border-t border-borderMuted pt-4"
          :style="{ height: verticalBottomHeightPercent }"
        >
          <template v-if="selectedPrompt || isCreatingNewPrompt">
            <h4 class="text-md font-medium text-deepText">
              {{ isCreatingNewPrompt ? 'Create New Prompt' : 'Edit Prompt' }}
            </h4>
            <TextItem
              v-model:value="editablePrompt.name"
              label="Prompt Name"
              placeholder="e.g. Code Reviewer"
            />
            <TextItem
              v-model:value="editablePrompt.command"
              label="Command"
              placeholder="e.g. review"
            >
              <template #prepend><span class="text-subtleText px-2">/</span></template>
            </TextItem>
            <TextItem
              v-model:value="editablePrompt.description"
              label="Description (Optional)"
              placeholder="e.g. Acts as a senior dev providing a code review."
            />
            <TextItem
              v-model:value="editablePrompt.template"
              type="textarea"
              label="Template"
              placeholder="<role>Act as a senior software engineer doing a code review.</role> Focus on code clarity, performance, and adherence to best practices. The user's code is: {{userInput}}"
              :rows="6"
            />
            <ButtonItem
              :disabled="!isFormValid || isSaving"
              @click="handleSaveChanges"
            >
              {{ isSaving ? 'Saving...' : 'Save Changes' }}
            </ButtonItem>
          </template>
          <div
            v-else-if="prompts.length > 0"
            class="flex h-full items-center justify-center text-subtleText"
          >
            <p>Select a prompt to edit.</p>
          </div>
        </div>
      </div>

      <!-- Desktop: Horizontal split -->
      <div
        ref="splitContainerRef"
        class="hidden md:flex flex-row h-full relative"
      >
        <!-- Left Pane: Prompts List -->
        <div
          class="flex flex-col gap-2 overflow-y-auto pr-4"
          :style="{ width: splitLeftWidthPercent }"
        >
          <div
            v-for="prompt in prompts"
            :key="prompt.id"
            class="flex items-center justify-between p-3 border border-borderMuted rounded-md hover:bg-panel cursor-pointer transition-colors"
            :class="{ 'bg-accent/10 border-accent': prompt.id === selectedPromptId }"
            @click="selectedPromptId = prompt.id"
          >
            <div class="flex-1 min-w-0">
              <div class="font-medium text-deepText truncate">{{ prompt.name }}</div>
              <div class="text-sm text-subtleText truncate">/{{ prompt.command }}</div>
            </div>
            <div class="flex items-center gap-1 flex-shrink-0">
              <span
                v-if="prompt.isSystem"
                class="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full"
                >System</span
              >
              <button
                v-if="!prompt.isSystem"
                class="text-subtleText hover:text-error p-1 transition-colors"
                title="Delete prompt"
                @click.stop="handleDeletePrompt(prompt.id)"
              >
                <i class="i-weui:delete-outlined" />
              </button>
            </div>
          </div>
          <div
            v-if="prompts.length === 0"
            class="text-center text-subtleText p-8"
          >
            No prompts created yet. <br />
            Click "New Prompt" to start.
          </div>
        </div>

        <!-- Resizer Handle -->
        <div
          class="relative flex items-center justify-center cursor-col-resize group"
          :class="{ 'bg-accent/10': splitIsDragging }"
          @mousedown="splitStartDragging"
        >
          <div
            class="w-0.5 h-12 rounded-full transition-all"
            :class="
              splitIsDragging
                ? 'bg-accent h-16'
                : 'bg-borderMuted group-hover:bg-accent group-hover:h-16'
            "
          />
        </div>

        <!-- Right Pane: Prompt Editor -->
        <div
          class="flex flex-col gap-4 overflow-y-auto pl-4 border-l border-borderMuted"
          :style="{ width: splitRightWidthPercent }"
        >
          <template v-if="selectedPrompt || isCreatingNewPrompt">
            <h4 class="text-md font-medium text-deepText">
              {{ isCreatingNewPrompt ? 'Create New Prompt' : 'Edit Prompt' }}
            </h4>
            <TextItem
              v-model:value="editablePrompt.name"
              label="Prompt Name"
              placeholder="e.g. Code Reviewer"
            />
            <TextItem
              v-model:value="editablePrompt.command"
              label="Command"
              placeholder="e.g. review"
            >
              <template #prepend><span class="text-subtleText px-2">/</span></template>
            </TextItem>
            <TextItem
              v-model:value="editablePrompt.description"
              label="Description (Optional)"
              placeholder="e.g. Acts as a senior dev providing a code review."
            />
            <TextItem
              v-model:value="editablePrompt.template"
              type="textarea"
              label="Template"
              placeholder="<role>Act as a senior software engineer doing a code review.</role><instruct>Focus on code clarity, performance, and adherence to best practices.</instruct>"
              :rows="10"
            />
            <div class="flex justify-end gap-2 mt-4">
              <ButtonItem
                variant="secondary"
                @click="resetEditablePrompt"
                >Cancel</ButtonItem
              >
              <ButtonItem
                :disabled="!isFormValid || isSaving"
                @click="handleSaveChanges"
              >
                {{ isSaving ? 'Saving...' : 'Save Changes' }}
              </ButtonItem>
            </div>
          </template>
          <div
            v-else-if="prompts.length > 0"
            class="flex h-full items-center justify-center text-subtleText"
          >
            <p>Select a prompt to view or edit its details.</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch, computed, inject } from 'vue'
import { usePromptsSocket } from '@/composables/use-prompts-socket'
import { useResizableSplit } from '@/composables/use-resizable-split'
import { KEY_VALUE_STORE_KEY } from '@/injection-keys'
import type { KeyValueStore } from '@/database/key-value-store'
import TextItem from '@/components/TextItem.vue'
import ButtonItem from '@/components/ButtonItem.vue'

const keyValueStore = inject<KeyValueStore>(KEY_VALUE_STORE_KEY)!

const {
  prompts,
  selectedPrompt,
  selectedPromptId,
  isLoading,
  error,
  fetchAllPrompts,
  createPrompt,
  updatePrompt,
  deletePrompt,
} = usePromptsSocket()

// Setup for horizontal (desktop) resizable split
const {
  containerRef: splitContainerRef,
  leftWidthPercent: splitLeftWidthPercent,
  rightWidthPercent: splitRightWidthPercent,
  isDragging: splitIsDragging,
  startDragging: splitStartDragging,
} = useResizableSplit({
  keyValueStore,
  storageKey: 'prompts-split-ratio',
  defaultRatio: 33,
  minRatio: 20,
  maxRatio: 50,
})

// Setup for vertical (mobile) resizable split
const {
  containerRef: verticalContainerRef,
  leftWidthPercent: verticalTopHeightPercent,
  rightWidthPercent: verticalBottomHeightPercent,
  isDragging: verticalIsDragging,
  startDragging: verticalStartDragging,
} = useResizableSplit({
  keyValueStore,
  storageKey: 'prompts-vertical-split-ratio',
  defaultRatio: 40,
  direction: 'vertical',
  minRatio: 20,
  maxRatio: 50,
})

const isCreatingNewPrompt = ref(false)
const isSaving = ref(false)

const editablePrompt = ref({
  id: undefined as number | undefined,
  name: '',
  command: '',
  description: '' as string | undefined,
  template: '',
})

watch(
  selectedPrompt,
  (newSelection) => {
    if (isCreatingNewPrompt.value) return // Don't override the form if user is creating a new prompt

    if (newSelection) {
      editablePrompt.value = { ...newSelection, description: newSelection.description ?? '' }
    } else {
      resetEditablePrompt(true)
    }
  },
  { immediate: true }
)

const isFormValid = computed(() => {
  return (
    editablePrompt.value.name.trim() &&
    editablePrompt.value.command.trim() &&
    editablePrompt.value.template.trim()
  )
})

function resetEditablePrompt(forceClear = false) {
  isCreatingNewPrompt.value = false
  if (selectedPrompt.value && !forceClear) {
    editablePrompt.value = {
      ...selectedPrompt.value,
      description: selectedPrompt.value.description ?? '',
    }
  } else {
    editablePrompt.value = { id: undefined, name: '', command: '', description: '', template: '' }
  }
}

function handleCreateNewPrompt() {
  isCreatingNewPrompt.value = true
  selectedPromptId.value = undefined
  editablePrompt.value = { id: undefined, name: '', command: '', description: '', template: '' }
}

async function handleSaveChanges() {
  if (!isFormValid.value) return
  isSaving.value = true

  const { id, name, command, template, description } = editablePrompt.value
  const payload = { name, command, template, description: description || undefined }

  const result = isCreatingNewPrompt.value
    ? await createPrompt(payload)
    : await updatePrompt({ id: id!, ...payload })

  result.match(
    () => {
      isCreatingNewPrompt.value = false
    },
    (saveError) => {
      console.error('Failed to save prompt:', saveError)
    }
  )

  isSaving.value = false
}

async function handleDeletePrompt(id: number) {
  if (confirm('Are you sure you want to delete this prompt?')) {
    await deletePrompt(id)
  }
}
</script>
