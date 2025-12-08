import { inject, ref, computed, onMounted, onUnmounted } from 'vue'
import { ResultAsync, err, ok, type Result } from 'neverthrow'
import type { ConsoleLogger } from '@simwai/utils'
import type { SocketManager } from '@/socket-manager'
import { SOCKET_MANAGER_KEY, LOGGER_KEY } from '@/injection-keys'
import type { Prompts } from '@babadeluxe/shared/generated-socket-types'
import { PromptError } from '@/errors'

// TODO Double check this, looks pretty much like a code smell
type GetPromptsResponse = Parameters<Parameters<Prompts.Actions['getPrompts']>[0]>[0]
type PromptItem = GetPromptsResponse['data'][0]

type CreatePromptPayload = Parameters<Prompts.Actions['createPrompt']>[0]
type CreatePromptResponse = Parameters<Parameters<Prompts.Actions['createPrompt']>[1]>[0]

type UpdatePromptPayload = Parameters<Prompts.Actions['updatePrompt']>[0]
type UpdatePromptResponse = Parameters<Parameters<Prompts.Actions['updatePrompt']>[1]>[0]

type DeletePromptPayload = Parameters<Prompts.Actions['deletePrompt']>[0]
type DeletePromptResponse = Parameters<Parameters<Prompts.Actions['deletePrompt']>[1]>[0]
type PromptCreatedPayload = Parameters<Prompts.Emission['promptCreated']>[0]
type PromptUpdatedPayload = Parameters<Prompts.Emission['promptUpdated']>[0]
type PromptDeletedPayload = Parameters<Prompts.Emission['promptDeleted']>[0]

const mapToPromptError = (error: unknown) =>
  error instanceof PromptError ? error : new PromptError(String(error))

/**
 * Infers if an error is a validation error based on message content.
 * Validation errors typically contain keywords related to input/format issues.
 */
function isValidationError(error: PromptError): boolean {
  const message = error.message.toLowerCase()

  const validationKeywords = [
    'validation',
    'invalid',
    'required',
    'must be',
    'should be',
    'cannot be empty',
    'cannot exceed',
    'too long',
    'too short',
    'already exists',
    'duplicate',
  ]

  return validationKeywords.some((keyword) => message.includes(keyword))
}
function emitGetPrompts(socket: SocketManager['promptsSocket']) {
  return new Promise<GetPromptsResponse>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new PromptError('Request for getPrompts timed out'))
    }, 15000)
    socket.emit('getPrompts', (response) => {
      clearTimeout(timeoutId)
      if (response.success) resolve(response)
      else reject(new PromptError(response.error || 'Backend error on getPrompts'))
    })
  })
}

function emitCreatePrompt(socket: SocketManager['promptsSocket'], payload: CreatePromptPayload) {
  return new Promise<CreatePromptResponse>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new PromptError('Request for createPrompt timed out'))
    }, 15000)
    socket.emit('createPrompt', payload, (response) => {
      clearTimeout(timeoutId)
      if (response.success) resolve(response)
      else reject(new PromptError(response.error || 'Backend error on createPrompt'))
    })
  })
}

function emitUpdatePrompt(socket: SocketManager['promptsSocket'], payload: UpdatePromptPayload) {
  return new Promise<UpdatePromptResponse>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new PromptError('Request for updatePrompt timed out'))
    }, 15000)
    socket.emit('updatePrompt', payload, (response) => {
      clearTimeout(timeoutId)
      if (response.success) resolve(response)
      else reject(new PromptError(response.error || 'Backend error on updatePrompt'))
    })
  })
}

function emitDeletePrompt(socket: SocketManager['promptsSocket'], payload: DeletePromptPayload) {
  return new Promise<DeletePromptResponse>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new PromptError('Request for deletePrompt timed out'))
    }, 15000)
    socket.emit('deletePrompt', payload, (response) => {
      clearTimeout(timeoutId)
      if (response.success) resolve(response)
      else reject(new PromptError(response.error || 'Backend error on deletePrompt'))
    })
  })
}

export function usePromptsSocket() {
  const socketManager = inject(SOCKET_MANAGER_KEY)!
  const { promptsSocket } = socketManager
  const logger = inject<ConsoleLogger>(LOGGER_KEY)!

  const prompts = ref<PromptItem[]>([])
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
  const onPromptCreated = (newPrompt: PromptCreatedPayload) => {
    const isPromptAlreadyInList = prompts.value.some((prompt) => prompt.id === newPrompt.id)
    if (!isPromptAlreadyInList) {
      prompts.value.push(newPrompt)
    }
  }

  const onPromptUpdated = (updatedPrompt: PromptUpdatedPayload) => {
    const promptIndex = prompts.value.findIndex((prompt) => prompt.id === updatedPrompt.id)
    const doesPromptExist = promptIndex !== -1
    if (doesPromptExist) {
      prompts.value[promptIndex] = { ...prompts.value[promptIndex], ...updatedPrompt }
    }
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
  const fetchAllPrompts = async (): Promise<Result<void, PromptError>> => {
    isLoading.value = true
    error.value = undefined

    const result = await ResultAsync.fromPromise(emitGetPrompts(promptsSocket), mapToPromptError)

    if (result.isErr()) {
      logger.error('Failed to fetch prompts:', result.error)
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
    return ok()
  }

  const createPrompt = async (
    promptData: CreatePromptPayload
  ): Promise<Result<CreatePromptResponse, PromptError>> => {
    const result = await ResultAsync.fromPromise(
      emitCreatePrompt(promptsSocket, promptData),
      mapToPromptError
    )

    if (result.isErr()) {
      logger.error('Failed to create prompt:', result.error)
      return err(result.error)
    }

    return ok(result.value)
  }

  const updatePrompt = async (
    updatePayload: UpdatePromptPayload
  ): Promise<Result<UpdatePromptResponse, PromptError>> => {
    const result = await ResultAsync.fromPromise(
      emitUpdatePrompt(promptsSocket, updatePayload),
      mapToPromptError
    )

    if (result.isErr()) {
      logger.error('Failed to update prompt:', result.error)
      return err(result.error)
    }

    return ok(result.value)
  }

  const deletePrompt = async (id: number): Promise<Result<DeletePromptResponse, PromptError>> => {
    const result = await ResultAsync.fromPromise(
      emitDeletePrompt(promptsSocket, { id }),
      mapToPromptError
    )

    if (result.isErr()) {
      logger.error('Failed to delete prompt:', result.error)
      return err(result.error)
    }

    return ok(result.value)
  }
  onMounted(() => {
    promptsSocket.on('promptCreated', onPromptCreated)
    promptsSocket.on('promptUpdated', onPromptUpdated)
    promptsSocket.on('promptDeleted', onPromptDeleted)
    void fetchAllPrompts()
  })

  onUnmounted(() => {
    promptsSocket.off('promptCreated', onPromptCreated)
    promptsSocket.off('promptUpdated', onPromptUpdated)
    promptsSocket.off('promptDeleted', onPromptDeleted)
  })

  return {
    prompts: computed(() => prompts.value),
    selectedPrompt,
    isSelectedPromptEditable,
    selectedPromptId,
    isLoading: computed(() => isLoading.value),
    error: computed(() => error.value),
    fetchAllPrompts,
    clearError,
    createPrompt,
    updatePrompt,
    deletePrompt,
    isValidationError,
  }
}
