import { ref, computed, onUnmounted, watch, readonly } from 'vue'
import { ResultAsync, err, ok, type Result } from 'neverthrow'
import type { SocketManager } from '@/socket-manager'
import type { Root } from '@babadeluxe/shared/generated-socket-types'
import { NetworkError, ValidationError, SocketError } from '@/errors'
import { socketTimeoutMs } from '@/constants'
import { logger } from '@/logger'
import { useSocketManager } from '@/composables/use-socket-manager'
import { retryWithBackoff } from '@/retry'

type GetPromptsResponse = Parameters<Parameters<Root.Actions['prompts:getPrompts']>[0]>[0]
export type Prompt = GetPromptsResponse['data'][0]

type CreatePromptPayload = Parameters<Root.Actions['prompts:createPrompt']>[0]
type CreatePromptResponse = Parameters<Parameters<Root.Actions['prompts:createPrompt']>[1]>[0]

type UpdatePromptPayload = Parameters<Root.Actions['prompts:updatePrompt']>[0]
type UpdatePromptResponse = Parameters<Parameters<Root.Actions['prompts:updatePrompt']>[1]>[0]

type DeletePromptPayload = Parameters<Root.Actions['prompts:deletePrompt']>[0]
type DeletePromptResponse = Parameters<Parameters<Root.Actions['prompts:deletePrompt']>[1]>[0]

type PromptCreatedPayload = Parameters<Root.Emission['prompts:promptCreated']>[0]
type PromptUpdatedPayload = Parameters<Root.Emission['prompts:promptUpdated']>[0]
type PromptDeletedPayload = Parameters<Root.Emission['prompts:promptDeleted']>[0]

type PromptOperationError = NetworkError | ValidationError | SocketError

function mapPromptError(context: string) {
  return (unknownError: unknown): PromptOperationError => {
    if (
      unknownError instanceof NetworkError ||
      unknownError instanceof ValidationError ||
      unknownError instanceof SocketError
    ) {
      return unknownError
    }
    if (unknownError instanceof Error) {
      return new NetworkError(unknownError.message, unknownError)
    }
    return new NetworkError(context, unknownError)
  }
}

function isValidationError(error: PromptOperationError): boolean {
  return error instanceof ValidationError
}

function emitGetPrompts(socket: SocketManager['promptsSocket']) {
  return new Promise<GetPromptsResponse>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new NetworkError('Failed to fetch prompts: timeout'))
    }, socketTimeoutMs.prompts)

    socket.emit('prompts:getPrompts', (response: GetPromptsResponse) => {
      clearTimeout(timeoutId)
      if (response.success) {
        resolve(response)
      } else {
        reject(new NetworkError(response.error || 'Failed to fetch prompts'))
      }
    })
  })
}

function emitCreatePrompt(socket: SocketManager['promptsSocket'], payload: CreatePromptPayload) {
  return new Promise<CreatePromptResponse>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new NetworkError('Failed to create prompt: timeout'))
    }, socketTimeoutMs.prompts)

    socket.emit('prompts:createPrompt', payload, (response: CreatePromptResponse) => {
      clearTimeout(timeoutId)
      if (response.success) {
        resolve(response)
      } else {
        reject(new NetworkError(response.error || 'Failed to create prompt'))
      }
    })
  })
}

function emitUpdatePrompt(socket: SocketManager['promptsSocket'], payload: UpdatePromptPayload) {
  return new Promise<UpdatePromptResponse>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new NetworkError('Failed to update prompt: timeout'))
    }, socketTimeoutMs.prompts)

    socket.emit('prompts:updatePrompt', payload, (response: UpdatePromptResponse) => {
      clearTimeout(timeoutId)
      if (response.success) {
        resolve(response)
      } else {
        reject(new NetworkError(response.error || 'Failed to update prompt'))
      }
    })
  })
}

function emitDeletePrompt(socket: SocketManager['promptsSocket'], payload: DeletePromptPayload) {
  return new Promise<DeletePromptResponse>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new NetworkError('Failed to delete prompt: timeout'))
    }, socketTimeoutMs.prompts)

    socket.emit('prompts:deletePrompt', payload, (response: DeletePromptResponse) => {
      clearTimeout(timeoutId)
      if (response.success) {
        resolve(response)
      } else {
        reject(new NetworkError(response.error || 'Failed to delete prompt'))
      }
    })
  })
}

export function usePromptsSocket() {
  const { socketManagerRef } = useSocketManager()

  const prompts = ref<Prompt[]>([])
  const isLoading = ref(false)
  const error = ref<string | undefined>()
  const selectedPromptId = ref<number | undefined>()

  const promptsSocketRef = computed(() => socketManagerRef.value?.promptsSocket)

  const selectedPrompt = computed(() =>
    prompts.value.find((prompt) => prompt.id === selectedPromptId.value)
  )

  const isSelectedPromptEditable = computed(() => {
    const isPromptSelected = Boolean(selectedPrompt.value)
    const isSystemPrompt = selectedPrompt.value?.isSystem === true
    return isPromptSelected && !isSystemPrompt
  })

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

  const fetchAllPromptsOnce = async (): Promise<Result<void, PromptOperationError>> => {
    const socket = promptsSocketRef.value
    if (!socket) {
      const socketError = new SocketError('Prompts socket not connected')
      error.value = socketError.message
      return err(socketError)
    }

    isLoading.value = true
    error.value = undefined

    const result = await ResultAsync.fromPromise(
      emitGetPrompts(socket),
      mapPromptError('Failed to fetch prompts')
    )

    if (result.isErr()) {
      error.value = result.error.message
      isLoading.value = false
      return err(result.error)
    }

    prompts.value = result.value.data
    const hasPrompts = prompts.value.length > 0
    const isNoPromptSelected = !selectedPromptId.value
    if (hasPrompts && isNoPromptSelected) {
      selectedPromptId.value = prompts.value[0].id
    }

    isLoading.value = false
    return ok(undefined)
  }

  const fetchAllPrompts = async (): Promise<Result<void, PromptOperationError>> => {
    // Single retry layer, only for initial/explicit loads
    const result = await retryWithBackoff(() => fetchAllPromptsOnce(), 'prompts:fetchAll', {
      maxRetries: 2,
    })

    return result
  }

  const createPrompt = async (
    promptData: CreatePromptPayload
  ): Promise<Result<CreatePromptResponse, PromptOperationError>> => {
    const socket = promptsSocketRef.value
    if (!socket) {
      return err(new SocketError('Prompts socket not connected'))
    }

    const result = await ResultAsync.fromPromise(
      emitCreatePrompt(socket, promptData),
      mapPromptError('Failed to create prompt')
    )

    if (result.isErr()) return err(result.error)
    return ok(result.value)
  }

  const updatePrompt = async (
    updatePayload: UpdatePromptPayload
  ): Promise<Result<UpdatePromptResponse, PromptOperationError>> => {
    const socket = promptsSocketRef.value
    if (!socket) {
      return err(new SocketError('Prompts socket not connected'))
    }

    const result = await ResultAsync.fromPromise(
      emitUpdatePrompt(socket, updatePayload),
      mapPromptError('Failed to update prompt')
    )

    if (result.isErr()) return err(result.error)
    return ok(result.value)
  }

  const deletePrompt = async (
    id: number
  ): Promise<Result<DeletePromptResponse, PromptOperationError>> => {
    const socket = promptsSocketRef.value
    if (!socket) {
      return err(new SocketError('Prompts socket not connected'))
    }

    const result = await ResultAsync.fromPromise(
      emitDeletePrompt(socket, { id }),
      mapPromptError('Failed to delete prompt')
    )

    if (result.isErr()) return err(result.error)
    return ok(result.value)
  }

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
