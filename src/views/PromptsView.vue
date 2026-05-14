<template>
  <section
    id="prompts"
    class="flex flex-col flex-1 min-h-0 w-full bg-slate"
  >
    <!-- Header -->
    <header class="flex items-center justify-between p-4 border-b border-borderMuted/20 bg-panel shadow-sm">
      <div class="flex items-center gap-2">
        <h2 class="text-lg font-onest font-semibold text-deepText">Prompt Library</h2>
        <span
          v-if="prompts.length > 0"
          class="text-xs bg-accent/15 text-accent px-2 py-0.5 rounded-full border border-accent/20"
        >
          {{ prompts.length }}
        </span>
      </div>

      <BaseButton
        data-testid="prompts-new-button"
        variant="primary"
        icon="i-bi:plus-lg"
        @click="handleCreateNewPrompt"
      >
        New Prompt
      </BaseButton>
    </header>

    <!-- Error state -->
    <div
      v-if="hasComponentError"
      class="flex-1 flex flex-col items-center justify-center p-8 gap-4"
    >
      <BaseEmptyState
        icon="i-bi:exclamation-triangle"
        title="Oops! Something went wrong"
        description="We couldn't load your prompt library. This might be a temporary connection issue."
      >
        <BaseButton
          variant="primary"
          @click="handleReload"
        >
          Reload Page
        </BaseButton>
      </BaseEmptyState>
    </div>

    <!-- Main Content -->
    <template v-else>
      <div
        id="horizontal-split-container"
        class="flex-1 flex min-h-0 overflow-hidden"
      >
        <PromptLayout
          ref-key="horizontal-split-container"
          direction="horizontal"
          :left-width-percent="splitLeftWidthPercent"
          :right-width-percent="splitRightWidthPercent"
          :is-dragging="splitIsDragging"
          @start-dragging="splitStartDragging"
        >
          <template #master>
            <div class="flex flex-col h-full bg-panel/30 border-r border-borderMuted/10">
              <div
                v-if="isLoading && prompts.length === 0"
                class="flex-1 flex items-center justify-center"
              >
                <BaseSpinner message="Loading library..." />
              </div>

              <div
                v-else-if="prompts.length === 0"
                class="flex-1 flex items-center justify-center p-8"
              >
                <BaseEmptyState
                  icon="i-hugeicons:quill-write-02" :has-border="true"
                  title="No prompts yet"
                  description="Create your first reusable prompt to speed up your workflow."
                >
                  <BaseButton
                    variant="ghost"
                    icon="i-bi:plus-lg"
                    class="mt-4"
                    @click="handleCreateNewPrompt"
                  >
                    Get Started
                  </BaseButton>
                </BaseEmptyState>
              </div>

              <div
                v-else
                class="flex-1 overflow-y-auto p-4"
              >
                <PromptList
                  :prompts="prompts"
                  :selected-prompt-id="selectedPromptId"
                  empty-description="Your library is empty."
                  @select="handleSelectPrompt"
                  @delete="handleDeletePrompt"
                />
              </div>
            </div>
          </template>

          <template #detail>
            <div
              v-if="editablePrompt"
              class="h-full flex flex-col p-6 bg-panel border border-borderMuted/30 rounded-xl m-4 shadow-sm"
            >
              <PromptEditor
                :prompt="editablePrompt"
                :is-creating="isCreatingNewPrompt"
                :is-saving="isSaving"
                :can-duplicate="canDuplicate"
                :duplicate-label="duplicateLabel"
                data-testid="prompt-editor"
                @save="handleSaveChanges"
                @change="handleFormChange"
                @duplicate="handleDuplicate"
              />
            </div>
            <div
              v-else-if="prompts.length > 0"
              class="h-full flex items-center justify-center"
            >
              <BaseEmptyState
                icon="i-hugeicons:quill-write-02" :has-border="true"
                description="Select a prompt from the list to view or edit its details."
                class="border border-borderMuted/20 border-dashed rounded-2xl p-12 bg-panel/20"
              />
            </div>
          </template>
        </PromptLayout>
      </div>
    </template>

    <BaseModal
      v-model:is-shown="deleteModal.isShown"
      data-testid="prompt-delete-modal"
      title="Delete Prompt"
      confirm-text="Delete"
      cancel-text="Cancel"
      size="sm"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    >
      <p class="text-deepText">
        Are you sure you want to delete
        <strong class="text-accent">{{ deleteModal.promptName }}</strong>?
      </p>
      <p class="text-sm text-subtleText mt-2">This action cannot be undone.</p>
    </BaseModal>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent, onMounted, watch } from 'vue'
import { useDebounceFn, useBreakpoints, breakpointsTailwind } from '@vueuse/core'
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
import PromptLayout from '@/components/PromptLayout.vue'

defineOptions({ name: 'PromptsView' })

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('md')

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
  refKey: 'horizontal-split-container',
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
  refKey: 'vertical-split-container',
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
