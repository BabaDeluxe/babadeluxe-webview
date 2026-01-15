<template>
  <section
    id="prompts"
    class="relative flex flex-col w-full h-full overflow-hidden bg-slate"
  >
    <!-- Header -->
    <div class="flex flex-row w-full items-center justify-between gap-2 px-4 pt-4 flex-shrink-0">
      <h3 class="text-lg font-medium text-deepText">All Prompts</h3>
      <BaseButton
        icon="i-bi:plus-circle"
        @click="handleCreateNewPrompt"
      >
        New Prompt
      </BaseButton>
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

    <!-- Error State (Initial Load Only) -->
    <div
      v-else-if="error"
      class="flex-1 flex flex-col justify-center items-center text-error p-4"
    >
      <i class="i-weui:error-outlined text-4xl mb-2"></i>
      <p>{{ error }}</p>
      <BaseButton
        class="mt-4"
        @click="handleRetryFetch"
      >
        Retry
      </BaseButton>
    </div>

    <!-- Main Content -->
    <div
      v-else
      class="flex-1 overflow-hidden px-4 pb-4 pt-4"
    >
      <!-- Save/Delete Error Banner -->
      <BaseAlert
        :message="saveErrorMessage"
        :type="saveErrorType"
        @close="saveErrorMessage = undefined"
      />

      <!-- Mobile: Vertical stack -->
      <div
        ref="verticalContainer"
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
            <BaseTextField
              v-model:value="editablePrompt.name"
              label="Prompt Name"
              placeholder="e.g. Code Reviewer"
              @update:value="handleFormChange"
            />
            <BaseTextField
              v-model:value="editablePrompt.command"
              label="Command"
              placeholder="e.g. review"
              @update:value="handleFormChange"
            >
              <template #prepend><span class="text-subtleText px-2">/</span></template>
            </BaseTextField>
            <BaseTextField
              v-model:value="editablePrompt.description"
              label="Description (Optional)"
              placeholder="e.g. Acts as a senior dev providing a code review."
              @update:value="handleFormChange"
            />
            <BaseTextField
              v-model:value="editablePrompt.template"
              type="textarea"
              label="Template"
              placeholder="<role>Act as a senior software engineer doing a code review.</role> Focus on code clarity, performance, and adherence to best practices. The user's code is: {{userInput}}"
              :rows="6"
              @update:value="handleFormChange"
            />
            <BaseButton
              :disabled="!isFormValid || isSaving"
              @click="handleSaveChanges"
            >
              {{ isSaving ? 'Saving...' : 'Save Changes' }}
            </BaseButton>
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
        ref="splitContainer"
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
              >
                System
              </span>
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
            <BaseTextField
              v-model:value="editablePrompt.name"
              label="Prompt Name"
              placeholder="e.g. Code Reviewer"
              @update:value="handleFormChange"
            />
            <BaseTextField
              v-model:value="editablePrompt.command"
              label="Command"
              placeholder="e.g. review"
              @update:value="handleFormChange"
            >
              <template #prepend><span class="text-subtleText px-2">/</span></template>
            </BaseTextField>
            <BaseTextField
              v-model:value="editablePrompt.description"
              label="Description (Optional)"
              placeholder="e.g. Acts as a senior dev providing a code review."
              @update:value="handleFormChange"
            />
            <BaseTextField
              v-model:value="editablePrompt.template"
              type="textarea"
              label="Template"
              placeholder="<role>Act as a senior software engineer doing a code review.</role><instruct>Focus on code clarity, performance, and adherence to best practices.</instruct>"
              :rows="10"
              @update:value="handleFormChange"
            />
            <div class="flex justify-end gap-2 mt-4">
              <BaseButton
                :disabled="!isFormValid || isSaving"
                @click="handleSaveChanges"
              >
                {{ isSaving ? 'Saving...' : 'Save Changes' }}
              </BaseButton>
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
import { useDebounceFn } from '@vueuse/core'
import { usePromptsSocket } from '@/composables/use-prompts-socket'
import { useResizableSplit } from '@/composables/use-resizable-split'
import { KEY_VALUE_STORE_KEY, LOGGER_KEY } from '@/injection-keys'
import type { KeyValueStore } from '@/database/key-value-store'
import type { ConsoleLogger } from '@simwai/utils'
import BaseTextField from '@/components/BaseTextField.vue'
import BaseButton from '@/components/BaseButton.vue'
import BaseAlert from '@/components/BaseAlert.vue'

const keyValueStore = inject<KeyValueStore>(KEY_VALUE_STORE_KEY)!
const logger = inject<ConsoleLogger>(LOGGER_KEY)!

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
  isValidationError,
} = usePromptsSocket()

// Setup for horizontal (desktop) resizable split
const {
  leftWidthPercent: splitLeftWidthPercent,
  rightWidthPercent: splitRightWidthPercent,
  isDragging: splitIsDragging,
  startDragging: splitStartDragging,
} = useResizableSplit({
  keyValueStore,
  storageKey: 'prompts-split-ratio',
  refKey: 'splitContainer',
  defaultRatio: 33,
  minRatio: 20,
  maxRatio: 50,
})

// Setup for vertical (mobile) resizable split
const {
  leftWidthPercent: verticalTopHeightPercent,
  rightWidthPercent: verticalBottomHeightPercent,
  isDragging: verticalIsDragging,
  startDragging: verticalStartDragging,
} = useResizableSplit({
  keyValueStore,
  storageKey: 'prompts-vertical-split-ratio',
  refKey: 'verticalContainer',
  defaultRatio: 40,
  direction: 'vertical',
  minRatio: 20,
  maxRatio: 50,
})

const isCreatingNewPrompt = ref(false)
const isSaving = ref(false)
const saveErrorMessage = ref<string | undefined>()

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
    if (isCreatingNewPrompt.value) return

    if (newSelection) {
      editablePrompt.value = {
        id: newSelection.id,
        name: newSelection.name,
        command: newSelection.command ?? '',
        description: newSelection.description ?? '',
        template: newSelection.template,
      }
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

const saveErrorType = computed<'error' | 'warning'>(() => {
  if (!saveErrorMessage.value) return 'error'

  return saveErrorMessage.value.startsWith('Invalid input:') ? 'warning' : 'error'
})

function resetEditablePrompt(forceClear = false) {
  isCreatingNewPrompt.value = false
  saveErrorMessage.value = undefined
  if (selectedPrompt.value && !forceClear) {
    editablePrompt.value = {
      id: selectedPrompt.value.id,
      name: selectedPrompt.value.name,
      command: selectedPrompt.value.command ?? '', // ← normalize
      description: selectedPrompt.value.description ?? '',
      template: selectedPrompt.value.template,
    }
  } else {
    editablePrompt.value = { id: undefined, name: '', command: '', description: '', template: '' }
  }
}

function handleCreateNewPrompt() {
  isCreatingNewPrompt.value = true
  selectedPromptId.value = undefined
  saveErrorMessage.value = undefined
  editablePrompt.value = { id: undefined, name: '', command: '', description: '', template: '' }
}

const debouncedClearError = useDebounceFn(() => {
  saveErrorMessage.value = undefined
}, 3000)

function handleFormChange() {
  if (saveErrorMessage.value) {
    debouncedClearError()
  }
}

async function handleSaveChanges() {
  if (!isFormValid.value) return

  isSaving.value = true
  saveErrorMessage.value = undefined

  const { id, name, command, template, description } = editablePrompt.value
  const payload = { name, command, template, description: description || undefined }

  const result = isCreatingNewPrompt.value
    ? await createPrompt(payload)
    : await updatePrompt({ id: id!, ...payload })

  if (result.isErr()) {
    const action = isCreatingNewPrompt.value ? 'create' : 'update'
    logger.error(`[PromptsView] Failed to ${action} prompt after user clicked Save:`, result.error)

    const isValidation = isValidationError(result.error)
    const cleanMessage = result.error.message.replace(/^\[.*?\]\s*/, '')

    saveErrorMessage.value = isValidation
      ? `Invalid input: ${cleanMessage}`
      : `Server error: ${cleanMessage}. Please try again later or contact support.`

    isSaving.value = false
    return
  }

  logger.log(`Successfully ${isCreatingNewPrompt.value ? 'created' : 'updated'} prompt`)
  isCreatingNewPrompt.value = false
  isSaving.value = false
}

async function handleDeletePrompt(id: number) {
  const shouldDelete = confirm('Are you sure you want to delete this prompt?')
  if (!shouldDelete) return

  saveErrorMessage.value = undefined

  const result = await deletePrompt(id)

  if (result.isErr()) {
    logger.error('Failed to delete prompt after user clicked Delete:', result.error)

    const isValidation = isValidationError(result.error)
    const cleanMessage = result.error.message.replace(/^\[.*?\]\s*/, '')

    saveErrorMessage.value = isValidation
      ? `Cannot delete: ${cleanMessage}`
      : `Server error: ${cleanMessage}. Please try again later.`

    return
  }

  logger.log('Successfully deleted prompt')
}

async function handleRetryFetch() {
  const result = await fetchAllPrompts()

  if (result.isErr()) {
    logger.error('Retry failed after user clicked Retry button:', result.error)
  }
}
</script>
