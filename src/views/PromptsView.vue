<template>
  <section
    id="prompts"
    class="relative flex flex-col w-full h-full bg-slate overflow-hidden"
  >
    <!-- Header -->
    <div class="flex flex-row w-full items-center justify-between flex-shrink-0 gap-2 px-4 pt-4">
      <h3 class="text-lg font-medium text-deepText">All Prompts</h3>
      <BaseButton
        icon="i-bi:plus-circle"
        @click="handleCreateNewPrompt"
      >
        New Prompt
      </BaseButton>
    </div>

    <!-- Unified Error/Warning Banners -->
    <BaseAlertList :banners="alertBanners" />

    <!-- Loading State -->
    <div
      v-if="isLoading"
      class="flex flex-1 justify-center items-center"
    >
      <BaseSpinner
        size="medium"
        message="Loading prompts..."
      />
    </div>

    <!-- Main Content -->
    <div
      v-else
      class="flex flex-col flex-1 w-full h-full overflow-hidden pt-4 px-4 min-h-0"
    >
      <!-- Mobile: Vertical stack -->
      <div
        ref="verticalContainer"
        class="flex flex-col md:hidden h-full min-h-0"
      >
        <!-- Top Pane: Prompts List -->
        <div
          class="overflow-y-auto pr-2"
          :style="{ height: verticalTopHeightPercent }"
        >
          <PromptList
            :prompts="prompts"
            :selected-prompt-id="selectedPromptId"
            :empty-description="'No prompts created yet. Click New Prompt to start.'"
            @select="handleSelectPrompt"
            @delete="handleDeletePrompt"
          />
        </div>

        <!-- Resizer Handle -->
        <div
          class="relative flex items-center justify-center cursor-row-resize group flex-shrink-0"
          :class="{ 'bg-accent/10': verticalIsDragging }"
          @pointerdown="verticalStartDragging"
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
          class="overflow-y-auto border-t border-borderMuted pt-4 pr-2"
          :style="{ height: verticalBottomHeightPercent }"
        >
          <PromptEditor
            v-if="selectedPrompt || isCreatingNewPrompt"
            :prompt="editablePrompt"
            :is-creating="isCreatingNewPrompt"
            :is-saving="isSaving"
            :rows="6"
            @save="handleSaveChanges"
            @change="handleFormChange"
          />
          <BaseEmptyState
            v-else-if="prompts.length > 0"
            icon="i-bi:cursor-text"
            description="Select a prompt to edit."
          />
        </div>
      </div>

      <!-- Desktop: Horizontal split -->
      <div
        ref="splitContainer"
        class="hidden md:flex flex-row h-full relative min-h-0"
      >
        <!-- Left Pane: Prompts List -->
        <div
          class="overflow-y-auto pr-4 min-w-0"
          :style="{ width: splitLeftWidthPercent }"
        >
          <PromptList
            :prompts="prompts"
            :selected-prompt-id="selectedPromptId"
            :empty-description="'No prompts created yet. Click New Prompt to start.'"
            @select="handleSelectPrompt"
            @delete="handleDeletePrompt"
          />
        </div>

        <!-- Resizer Handle -->
        <div
          class="relative flex items-center justify-center cursor-col-resize group touch-none select-none"
          :class="{ 'bg-accent/10': splitIsDragging }"
          @pointerdown="splitStartDragging"
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
          class="overflow-y-auto pl-4 pr-2 border-l border-borderMuted min-w-0"
          :style="{ width: splitRightWidthPercent }"
        >
          <PromptEditor
            v-if="selectedPrompt || isCreatingNewPrompt"
            :prompt="editablePrompt"
            :is-creating="isCreatingNewPrompt"
            :is-saving="isSaving"
            :rows="10"
            @save="handleSaveChanges"
            @change="handleFormChange"
          />
          <BaseEmptyState
            v-else-if="prompts.length > 0"
            icon="i-bi:cursor-text"
            description="Select a prompt to view or edit its details."
          />
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <BaseModal
      v-model:show="deleteModal.show"
      title="Delete Prompt"
      confirm-text="Delete"
      cancel-text="Cancel"
      size="small"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    >
      <p class="text-deepText">
        Are you sure you want to delete
        <strong class="text-accent">{{ deleteModal.promptName }}</strong
        >?
      </p>
      <p class="text-sm text-subtleText mt-2">This action cannot be undone.</p>
    </BaseModal>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { usePromptsSocket } from '@/composables/use-prompts-socket'
import { useResizableSplit } from '@/composables/use-resizable-split'
import { KEY_VALUE_STORE_KEY, LOGGER_KEY } from '@/injection-keys'
import type { KeyValueStore } from '@/database/key-value-store'
import type { ConsoleLogger } from '@simwai/utils'
import BaseButton from '@/components/BaseButton.vue'
import BaseAlertList from '@/components/BaseAlertList.vue'
import BaseSpinner from '@/components/BaseSpinner.vue'
import BaseEmptyState from '@/components/BaseEmptyState.vue'
import BaseModal from '@/components/BaseModal.vue'
import PromptList from '@/components/PromptList.vue'
import PromptEditor from '@/components/PromptEditor.vue'

const keyValueStore = inject<KeyValueStore>(KEY_VALUE_STORE_KEY)!
const logger = inject<ConsoleLogger>(LOGGER_KEY)!

const {
  prompts,
  selectedPrompt,
  selectedPromptId,
  isLoading,
  error,
  createPrompt,
  updatePrompt,
  deletePrompt,
  isValidationError,
  clearError,
} = usePromptsSocket()

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
const saveError = ref<string | undefined>()

const deleteModal = ref({
  show: false,
  promptId: null as number | null,
  promptName: '',
})

const editablePrompt = computed(() => {
  if (isCreatingNewPrompt.value) {
    return {
      id: undefined,
      name: '',
      command: '',
      description: '',
      template: '',
    }
  }

  if (selectedPrompt.value) {
    return {
      id: selectedPrompt.value.id,
      name: selectedPrompt.value.name,
      command: selectedPrompt.value.command ?? '',
      description: selectedPrompt.value.description ?? '',
      template: selectedPrompt.value.template,
    }
  }

  return undefined
})

const alertBanners = computed(() => {
  const banners = []

  if (error.value) {
    banners.push({
      id: 'fetch-error',
      message: error.value,
      type: 'error' as const,
      isDismissible: true,
      onClose: () => {
        clearError()
      },
    })
  }

  if (saveError.value) {
    const isValidation = saveError.value.startsWith('Invalid input:')
    const alertType = isValidation ? ('warning' as const) : ('error' as const)

    banners.push({
      id: 'save-error',
      message: saveError.value,
      type: alertType,
      isDismissible: true,
      onClose: () => {
        saveError.value = undefined
      },
    })
  }

  return banners
})

function handleSelectPrompt(promptId: number) {
  selectedPromptId.value = promptId
  isCreatingNewPrompt.value = false
  saveError.value = undefined
}

function handleCreateNewPrompt() {
  isCreatingNewPrompt.value = true
  selectedPromptId.value = undefined
  saveError.value = undefined
}

const debouncedClearSaveError = useDebounceFn(() => {
  saveError.value = undefined
}, 3000)

function handleFormChange() {
  if (saveError.value) debouncedClearSaveError()
}

async function handleSaveChanges(payload: {
  id?: number
  name: string
  command: string
  description?: string
  template: string
}) {
  isSaving.value = true
  saveError.value = undefined

  const result = isCreatingNewPrompt.value
    ? await createPrompt(payload)
    : await updatePrompt({ id: payload.id!, ...payload })

  if (result.isErr()) {
    const action = isCreatingNewPrompt.value ? 'create' : 'update'
    logger.error(`Failed to ${action} prompt:`, result.error)

    const isValidation = isValidationError(result.error)
    const cleanMessage = result.error.message.replace(/^\[.*?\]\s*/, '')

    saveError.value = isValidation
      ? `Invalid input: ${cleanMessage}`
      : `Server error: ${cleanMessage}. Please try again later or contact support.`

    isSaving.value = false
    return
  }

  logger.log(`Successfully ${isCreatingNewPrompt.value ? 'created' : 'updated'} prompt`)
  isCreatingNewPrompt.value = false
  isSaving.value = false
}

function handleDeletePrompt(promptId: number) {
  const prompt = prompts.value.find((p) => p.id === promptId)
  if (!prompt) return

  deleteModal.value = {
    show: true,
    promptId,
    promptName: prompt.name,
  }
}

async function confirmDelete() {
  if (deleteModal.value.promptId === null) return

  saveError.value = undefined

  const result = await deletePrompt(deleteModal.value.promptId)

  if (result.isErr()) {
    logger.error('Failed to delete prompt:', result.error)

    const isValidation = isValidationError(result.error)
    const cleanMessage = result.error.message.replace(/^\[.*?\]\s*/, '')

    saveError.value = isValidation
      ? `Cannot delete: ${cleanMessage}`
      : `Server error: ${cleanMessage}. Please try again later.`

    cancelDelete()
    return
  }

  logger.log('Successfully deleted prompt')
  cancelDelete()
}

function cancelDelete() {
  deleteModal.value = {
    show: false,
    promptId: null,
    promptName: '',
  }
}
</script>
