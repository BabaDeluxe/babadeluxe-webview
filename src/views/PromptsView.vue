<template>
  <section
    id="prompts"
    data-testid="prompts-container"
    class="flex-1 flex flex-col h-screen overflow-hidden bg-bg"
  >
    <div
      v-if="hasComponentError"
      data-testid="component-error"
      class="flex-1 flex flex-col items-center justify-center gap-4 text-center"
    >
      <p class="text-error text-lg">Something went wrong with the prompts view.</p>
      <BaseButton
        variant="secondary"
        @click="handleReload"
      >
        Reload Page
      </BaseButton>
    </div>

    <div
      v-else-if="isLoading"
      data-testid="loading-state"
      class="flex-1 flex items-center justify-center"
    >
      <BaseSpinner
        size="large"
        message="Loading prompts..."
      />
    </div>

    <template v-else>
      <header class="flex items-center justify-between px-6 py-4 border-b border-borderMuted">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-accent/10 text-accent">
            <i class="i-bi:cursor-text text-xl" />
          </div>
          <div>
            <h1 class="text-xl font-onest font-semibold text-deepText">Prompt Library</h1>
            <p class="text-xs text-subtleText">Manage and customize your AI instructions</p>
          </div>
        </div>
        <BaseButton
          variant="primary"
          icon="i-bi:plus-lg"
          text="New Prompt"
          data-testid="create-prompt-btn"
          @click="handleCreateNewPrompt"
        />
      </header>

      <div
        ref="verticalContainer"
        class="flex-1 flex flex-col min-h-0"
      >
        <div
          ref="splitContainer"
          class="flex-1 flex min-h-0"
        >
          <div
            class="flex flex-col border-r border-borderMuted bg-panel/50"
            :style="{ width: splitLeftWidthPercent }"
          >
            <PromptList
              :prompts="prompts"
              :selected-id="selectedPromptId"
              :is-creating="isCreatingNewPrompt"
              data-testid="prompt-list"
              @select="handleSelectPrompt"
              @delete="handleDeletePrompt"
            />
          </div>

          <div
            class="flex-1 flex flex-col bg-bg overflow-y-auto pr-2 border-l border-borderMuted min-w-0"
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
import { ref, computed, defineAsyncComponent, onMounted, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { ResultAsync } from 'neverthrow'
import { usePromptsSocket } from '@/composables/use-prompts-socket'
import { useResizableSplit } from '@/composables/use-resizable-split'
import { KEY_VALUE_STORE_KEY, LOGGER_KEY, SUPABASE_CLIENT_KEY } from '@/injection-keys'
import { safeInject } from '@/safe-inject'
import { AuthError } from '@/errors'
import { toUserMessage } from '@/error-mapper'
import { useToastStore } from '@/stores/use-toast-store'
import { isOfflineMode } from '@/env-validator'
import BaseButton from '@/components/BaseButton.vue'
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

const toasts = useToastStore()

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

watch(
  error,
  (val) => {
    if (val) {
      toasts.error(toUserMessage(val))
      clearError()
    }
  },
  { immediate: true }
)

watch(
  saveError,
  (val) => {
    if (val) {
      const isValidation = val.startsWith('Invalid prompt') || val.startsWith('Cannot delete')
      if (isValidation) {
        toasts.warning(toUserMessage(val))
      } else {
        toasts.error(toUserMessage(val))
      }
    }
  },
  { immediate: true }
)

const fetchUserId = async (): Promise<void> => {
  if (isOfflineMode()) {
    currentUserId.value = 'offline-user'
    return
  }

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
