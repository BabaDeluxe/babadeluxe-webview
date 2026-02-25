<template>
  <section
    id="prompts"
    data-testid="prompts-view-container"
    class="relative flex flex-col flex-1 min-h-0 w-full bg-slate overflow-hidden"
  >
    <div class="flex flex-row w-full items-center justify-between flex-shrink-0 gap-2 px-4 pt-4">
      <h3 class="text-lg font-medium text-deepText">All Prompts</h3>
      <BaseButton
        variant="primary"
        data-testid="prompts-new-button"
        icon="i-bi:plus-circle"
        @click="handleCreateNewPrompt"
      >
        New Prompt
      </BaseButton>
    </div>

    <div
      v-if="hasComponentError"
      data-testid="component-error"
      class="flex flex-1 flex-col items-center justify-center gap-4 text-center px-4"
    >
      <p class="text-error text-lg">Something went wrong with the prompts view.</p>
      <BaseButton
        variant="ghost"
        data-testid="prompts-reload-button"
        @click="handleReload"
      >
        Reload Page
      </BaseButton>
    </div>

    <template v-else>
      <BaseAlertList :banners="alertBanners" />

      <div
        v-if="isLoading"
        data-testid="prompts-loading-state"
        class="flex flex-1 justify-center items-center"
      >
        <BaseSpinner
          size="medium"
          message="Loading prompts..."
        />
      </div>

      <div
        v-else
        class="flex flex-col flex-1 min-h-0 w-full overflow-hidden pt-4 px-4"
      >
        <!-- Mobile stacked layout -->
        <div
          ref="verticalContainer"
          class="flex flex-col flex-1 min-h-0 md:hidden"
        >
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
              :can-duplicate="canDuplicate"
              :duplicate-label="duplicateLabel"
              data-testid="prompt-editor"
              @save="handleSaveChanges"
              @change="handleFormChange"
              @duplicate="handleDuplicate"
            />
            <BaseEmptyState
              v-else-if="prompts.length > 0"
              icon="i-bi:cursor-text"
              description="Select a prompt to edit."
            />
          </div>
        </div>

        <!-- Desktop split layout -->
        <div
          ref="splitContainer"
          class="hidden md:flex flex-row flex-1 min-h-0 relative"
        >
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
              :can-duplicate="canDuplicate"
              :duplicate-label="duplicateLabel"
              data-testid="prompt-editor"
              @save="handleSaveChanges"
              @change="handleFormChange"
              @duplicate="handleDuplicate"
            />
            <BaseEmptyState
              v-else-if="prompts.length > 0"
              icon="i-bi:cursor-text"
              description="Select a prompt to view or edit its details."
            />
          </div>
        </div>
      </div>
    </template>

    <BaseModal
      v-model:is-shown="deleteModal.isShown"
      data-test-id="prompt-delete-modal"
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
import { ref, computed, defineAsyncComponent, onMounted } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { ResultAsync } from 'neverthrow'
import { usePromptsSocket } from '@/composables/use-prompts-socket'
import { useResizableSplit } from '@/composables/use-resizable-split'
import { KEY_VALUE_STORE_KEY, LOGGER_KEY, SUPABASE_CLIENT_KEY } from '@/injection-keys'
import { safeInject } from '@/safe-inject'
import { AuthError } from '@/errors'
import BaseButton from '@/components/BaseButton.vue'
import BaseAlertList from '@/components/BaseAlertList.vue'
import BaseSpinner from '@/components/BaseSpinner.vue'
import BaseEmptyState from '@/components/BaseEmptyState.vue'
import PromptList from '@/components/PromptList.vue'

defineOptions({ name: 'PromptsView' })

// eslint-disable-next-line @typescript-eslint/naming-convention
const PromptEditor = defineAsyncComponent({
  loader: () => import('@/components/PromptEditor.vue'),
  loadingComponent: BaseSpinner,
  delay: 200,
})
// eslint-disable-next-line @typescript-eslint/naming-convention
const BaseModal = defineAsyncComponent(() => import('@/components/BaseModal.vue'))

const keyValueStore = safeInject(KEY_VALUE_STORE_KEY)
const logger = safeInject(LOGGER_KEY)
const supabase = safeInject(SUPABASE_CLIENT_KEY)

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
  minRatio: 0,
  maxRatio: 50,
})

const isCreatingNewPrompt = ref(false)
const isSaving = ref(false)
const saveError = ref<string | undefined>()
const currentUserId = ref<string>()
const hasComponentError = ref(false)

const deleteModal = ref({
  isShown: false,
  promptId: null as number | null,
  promptName: '',
})

const handleReload = () => {
  window.location.reload()
}

const editablePrompt = computed(() => {
  if (isCreatingNewPrompt.value) {
    return {
      id: undefined,
      name: '',
      command: '',
      description: '',
      template: '',
      isSystem: false,
      fkUserId: currentUserId.value ?? undefined,
    }
  }

  if (selectedPrompt.value) {
    return {
      id: selectedPrompt.value.id,
      name: selectedPrompt.value.name,
      command: selectedPrompt.value.command ?? '',
      description: selectedPrompt.value.description ?? '',
      template: selectedPrompt.value.template,
      isSystem: selectedPrompt.value.isSystem,
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
    const isValidation =
      saveError.value.startsWith('Invalid prompt') || saveError.value.startsWith('Cannot delete')
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

const fetchUserId = async (): Promise<void> => {
  const getUserResult = await ResultAsync.fromPromise(supabase.auth.getUser(), (unknownError) => {
    if (unknownError instanceof Error) {
      return new AuthError(unknownError.message, unknownError)
    }
    return new AuthError('Failed to fetch user', unknownError)
  })

  getUserResult.match(
    (response) => {
      if (response.data.user?.id) {
        currentUserId.value = response.data.user.id
      }
    },
    (fetchError) => {
      logger.error('Failed to fetch user details for prompts view', {
        error: fetchError,
      })
    }
  )
}

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
    logger.error(`Failed to ${action} prompt`, {
      userId: currentUserId.value,
      promptId: payload.id,
      promptName: payload.name,
      error: result.error,
    })

    const isValidation = isValidationError(result.error)

    saveError.value = isValidation
      ? 'Invalid prompt data. Check required fields and character limits.'
      : 'Failed to save prompt. Please try again or contact support.'

    isSaving.value = false
    return
  }

  logger.log(`Successfully ${isCreatingNewPrompt.value ? 'created' : 'updated'} prompt`, {
    userId: currentUserId.value,
    promptId: payload.id,
  })
  isCreatingNewPrompt.value = false
  isSaving.value = false
}

function handleDeletePrompt(promptId: number) {
  const prompt = prompts.value.find((p) => p.id === promptId)
  if (!prompt) return

  deleteModal.value = {
    isShown: true,
    promptId,
    promptName: prompt.name,
  }
}

async function confirmDelete() {
  if (deleteModal.value.promptId === null) return

  saveError.value = undefined

  const result = await deletePrompt(deleteModal.value.promptId)

  if (result.isErr()) {
    logger.error('Failed to delete prompt', {
      userId: currentUserId.value,
      promptId: deleteModal.value.promptId,
      promptName: deleteModal.value.promptName,
      error: result.error,
    })

    const isValidation = isValidationError(result.error)

    saveError.value = isValidation
      ? 'Cannot delete this prompt. It may be in use.'
      : 'Failed to delete prompt. Please try again later.'

    cancelDelete()
    return
  }

  logger.log('Successfully deleted prompt', {
    userId: currentUserId.value,
    promptId: deleteModal.value.promptId,
  })
  cancelDelete()
}

function cancelDelete() {
  deleteModal.value = {
    isShown: false,
    promptId: null,
    promptName: '',
  }
}

const canDuplicate = computed(() => !!selectedPrompt.value && !isCreatingNewPrompt.value)

const duplicateLabel = computed(() => {
  const prompt = selectedPrompt.value
  if (!prompt) return 'Duplicate'
  if (prompt.isSystem) {
    return 'Copy to my prompts'
  }
  return 'Duplicate'
})

async function handleDuplicate(payload: {
  name: string
  command: string
  description?: string
  template: string
}) {
  if (!selectedPrompt.value) return

  const source = selectedPrompt.value
  isSaving.value = true
  saveError.value = undefined

  const result = await createPrompt({
    name: payload.name,
    command: payload.command,
    description: payload.description,
    template: payload.template,
  })

  if (result.isErr()) {
    logger.error('Failed to duplicate prompt', {
      userId: currentUserId.value,
      fromPromptId: source.id,
      error: result.error,
    })

    const isValidation = isValidationError(result.error)

    saveError.value = isValidation
      ? 'Invalid prompt data. Check required fields and character limits.'
      : 'Failed to duplicate prompt. Please try again or contact support.'

    isSaving.value = false
    return
  }

  const isSystemGlobal = source.isSystem

  logger.log(isSystemGlobal ? 'Copied system prompt to user prompts' : 'Duplicated prompt', {
    userId: currentUserId.value,
    fromPromptId: source.id,
  })

  isCreatingNewPrompt.value = false
  isSaving.value = false
}

onMounted(async () => {
  await fetchUserId()
})
</script>
