import { ref, computed, onUnmounted, watch, readonly } from 'vue'
import { err, ok, type Result } from 'neverthrow'
import type { Root } from '@babadeluxe/shared/generated-socket-types'
import { NetworkError, ValidationError, SocketError } from '@/errors'
import { socketTimeoutMs } from '@/constants'
import { logger } from '@/logger'
import { useSocketManager } from '@/composables/use-socket-manager'
import { retryWithBackoff } from '@/retry'
import { emitWithTimeout } from '@/emit-with-timeout'

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

export type Prompt = Root.Emission['prompts:promptCreated'] extends (p: infer P) => void ? P : never

type CreatePromptPayload = Parameters<Root.Actions['prompts:createPrompt']>[0]
type UpdatePromptPayload = Parameters<Root.Actions['prompts:updatePrompt']>[0]
type DeletePromptPayload = Parameters<Root.Actions['prompts:deletePrompt']>[0]

type PromptCreatedPayload = Parameters<Root.Emission['prompts:promptCreated']>[0]
type PromptUpdatedPayload = Parameters<Root.Emission['prompts:promptUpdated']>[0]
type PromptDeletedPayload = Parameters<Root.Emission['prompts:promptDeleted']>[0]

type PromptOperationError = NetworkError | ValidationError | SocketError

// ----------------------------------------------------------------------
// Error helpers (convert unknown to domain error)
// ----------------------------------------------------------------------

function mapPromptError(context: string) {
  return (unknownError: unknown): PromptOperationError => {
    // If it's already one of our domain errors, return it as-is.
    if (
      unknownError instanceof NetworkError ||
      unknownError instanceof ValidationError ||
      unknownError instanceof SocketError
    ) {
      return unknownError
    }

    // If it's a generic Error, wrap it in a NetworkError (preserving cause).
    if (unknownError instanceof Error) {
      return new NetworkError(unknownError.message, unknownError)
    }

    // For anything else (string, object, etc.), create a NetworkError with a generic message.
    return new NetworkError(context, unknownError)
  }
}

function isValidationError(error: PromptOperationError): boolean {
  return error instanceof ValidationError
}

// ----------------------------------------------------------------------
// Main composable
// ----------------------------------------------------------------------

export function usePromptsSocket() {
  const { socketManagerRef } = useSocketManager()

  const promptsSocketRef = computed<Root.Socket | null | undefined>(() => {
    return socketManagerRef.value?.promptsSocket ?? null
  })

  const prompts = ref<Prompt[]>([])
  const isLoading = ref(false)
  const error = ref<string | undefined>()
  const selectedPromptId = ref<number | undefined>()

  const selectedPrompt = computed(() =>
    prompts.value.find((prompt) => prompt.id === selectedPromptId.value)
  )

  const isSelectedPromptEditable = computed(() => {
    const isPromptSelected = Boolean(selectedPrompt.value)
    const isSystemPrompt = selectedPrompt.value?.isSystem === true
    return isPromptSelected && !isSystemPrompt
  })

  // --------------------------------------------------------------------
  // Event listeners (for real‑time updates)
  // --------------------------------------------------------------------

  const onPromptCreated = (newPrompt: PromptCreatedPayload) => {
    const isPromptAlreadyInList = prompts.value.some((prompt) => prompt.id === newPrompt.id)
    if (isPromptAlreadyInList) return
    prompts.value.push(newPrompt)
  }

  const onPromptUpdated = (updatedPrompt: PromptUpdatedPayload) => {
    const promptIndex = prompts.value.findIndex((prompt) => prompt.id === updatedPrompt.id)
    const doesPromptExist = promptIndex !== -1
    if (!doesPromptExist) {
      logger.debug('Prompt update received for unknown prompt, refetching list', {
        promptId: updatedPrompt.id,
      })
      void fetchAllPrompts()
      return
    }
    prompts.value[promptIndex] = { ...prompts.value[promptIndex], ...updatedPrompt }
  }

  const onPromptDeleted = (deletedPrompt: PromptDeletedPayload) => {
    prompts.value = prompts.value.filter((prompt) => prompt.id !== deletedPrompt.id)
    const wasSelectedPromptDeleted = selectedPromptId.value === deletedPrompt.id
    if (wasSelectedPromptDeleted) {
      selectedPromptId.value = prompts.value[0]?.id
    }
  }

  const clearError = () => {
    error.value = undefined
  }

  // --------------------------------------------------------------------
  // API calls – all return Promise<Result<…>>
  // --------------------------------------------------------------------

  const fetchAllPromptsOnce = async (): Promise<Result<void, PromptOperationError>> => {
    if (!promptsSocketRef.value) {
      const socketError = new SocketError('Prompts socket not connected')
      error.value = socketError.message
      return err(socketError)
    }

    isLoading.value = true
    error.value = undefined

    const result = await emitWithTimeout({
      socket: promptsSocketRef,
      actionName: 'prompts:getPrompts',
      timeoutMs: socketTimeoutMs.prompts,
    })

    if (result.isErr()) {
      const mappedError = mapPromptError('Failed to fetch prompts')(result.error)
      error.value = mappedError.message
      isLoading.value = false
      return err(mappedError)
    }

    // TODO Check if the shared types are correct, because this cast is weird
    prompts.value = result.value as Prompt[]
    const hasPrompts = prompts.value.length > 0
    const isNoPromptSelected = !selectedPromptId.value
    if (hasPrompts && isNoPromptSelected) {
      selectedPromptId.value = prompts.value[0].id
    }

    isLoading.value = false
    return ok(undefined)
  }

  const fetchAllPrompts = async (): Promise<Result<void, PromptOperationError>> => {
    const result = await retryWithBackoff(() => fetchAllPromptsOnce(), 'prompts:fetchAll', {
      maxRetries: 2,
    })
    return result
  }

  const createPrompt = async (
    promptData: CreatePromptPayload
  ): Promise<Result<void, PromptOperationError>> => {
    if (!promptsSocketRef.value) {
      return err(new SocketError('Prompts socket not connected'))
    }

    const result = await emitWithTimeout({
      socket: promptsSocketRef,
      actionName: 'prompts:createPrompt',
      payload: promptData,
      timeoutMs: socketTimeoutMs.prompts,
    })

    if (result.isErr()) {
      const mappedError = mapPromptError('Failed to create prompt')(result.error)
      return err(mappedError)
    }

    // Success – the server returned { success: true } (no data)
    return ok(undefined)
  }

  const updatePrompt = async (
    updatePayload: UpdatePromptPayload
  ): Promise<Result<void, PromptOperationError>> => {
    if (!promptsSocketRef.value) {
      return err(new SocketError('Prompts socket not connected'))
    }

    const result = await emitWithTimeout({
      socket: promptsSocketRef,
      actionName: 'prompts:updatePrompt',
      payload: updatePayload,
      timeoutMs: socketTimeoutMs.prompts,
    })

    if (result.isErr()) {
      const mappedError = mapPromptError('Failed to update prompt')(result.error)
      return err(mappedError)
    }

    return ok(undefined)
  }

  const deletePrompt = async (id: number): Promise<Result<void, PromptOperationError>> => {
    if (!promptsSocketRef.value) {
      return err(new SocketError('Prompts socket not connected'))
    }

    const result = await emitWithTimeout({
      socket: promptsSocketRef,
      actionName: 'prompts:deletePrompt',
      payload: { id } satisfies DeletePromptPayload,
      timeoutMs: socketTimeoutMs.prompts,
    })

    if (result.isErr()) {
      const mappedError = mapPromptError('Failed to delete prompt')(result.error)
      return err(mappedError)
    }

    return ok(undefined)
  }

  // --------------------------------------------------------------------
  // Setup and cleanup
  // --------------------------------------------------------------------

  watch(
    promptsSocketRef,
    (newSocket, oldSocket) => {
      if (oldSocket) {
        oldSocket.off('prompts:promptCreated', onPromptCreated)
        oldSocket.off('prompts:promptUpdated', onPromptUpdated)
        oldSocket.off('prompts:promptDeleted', onPromptDeleted)
      }
      if (newSocket) {
        newSocket.on('prompts:promptCreated', onPromptCreated)
        newSocket.on('prompts:promptUpdated', onPromptUpdated)
        newSocket.on('prompts:promptDeleted', onPromptDeleted)
        void fetchAllPrompts()
      }
    },
    { immediate: true }
  )

  onUnmounted(() => {
    if (!promptsSocketRef.value) return
    promptsSocketRef.value.off('prompts:promptCreated', onPromptCreated)
    promptsSocketRef.value.off('prompts:promptUpdated', onPromptUpdated)
    promptsSocketRef.value.off('prompts:promptDeleted', onPromptDeleted)
  })

  // --------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------

  return {
    prompts: readonly(prompts),
    selectedPrompt,
    isSelectedPromptEditable,
    selectedPromptId,
    isLoading: readonly(isLoading),
    error: readonly(error),
    fetchAllPrompts,
    clearError,
    createPrompt,
    updatePrompt,
    deletePrompt,
    isValidationError,
  }
}
