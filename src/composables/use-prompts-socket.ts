import { inject, ref, computed, onMounted, onUnmounted } from 'vue'
import { ResultAsync } from 'neverthrow'
import type { SocketManager } from '@/socket-manager'
import { SOCKET_MANAGER_KEY } from '@/injection-keys'
import type { Prompts } from '@babadeluxe/shared/generated-socket-types'

// --- Correctly Inferring Types from the Generated Signatures ---
type GetPromptsResponse = Parameters<Parameters<Prompts.Actions['getPrompts']>[0]>[0]
type PromptItem = GetPromptsResponse['data'][0]

type CreatePromptPayload = Parameters<Prompts.Actions['createPrompt']>[0]
type CreatePromptResponse = Parameters<Parameters<Prompts.Actions['createPrompt']>[1]>[0]

type UpdatePromptPayload = Parameters<Prompts.Actions['updatePrompt']>[0]
type UpdatePromptResponse = Parameters<Parameters<Prompts.Actions['updatePrompt']>[1]>[0]

type DeletePromptPayload = Parameters<Prompts.Actions['deletePrompt']>[0]
type DeletePromptResponse = Parameters<Parameters<Prompts.Actions['deletePrompt']>[1]>[0]

// Correctly get the payload type for emission events
type PromptCreatedPayload = Parameters<Prompts.Emission['promptCreated']>[0]
type PromptUpdatedPayload = Parameters<Prompts.Emission['promptUpdated']>[0]
type PromptDeletedPayload = Parameters<Prompts.Emission['promptDeleted']>[0]

class PromptError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PromptError'
  }
}

const mapToPromptError = (error: unknown) =>
  error instanceof PromptError ? error : new PromptError(String(error))

// --- Specific, Typed Emitter Functions ---

function emitGetPrompts(socket: SocketManager['promptsSocket']) {
  return new Promise<GetPromptsResponse>((resolve, reject) => {
    const timeoutId = setTimeout(
      () => reject(new PromptError('Request for getPrompts timed out')),
      15000
    )
    socket.emit('getPrompts', (response) => {
      clearTimeout(timeoutId)
      if (response.success) resolve(response)
      else reject(new PromptError(response.error || 'Backend error on getPrompts'))
    })
  })
}

function emitCreatePrompt(socket: SocketManager['promptsSocket'], payload: CreatePromptPayload) {
  return new Promise<CreatePromptResponse>((resolve, reject) => {
    const timeoutId = setTimeout(
      () => reject(new PromptError('Request for createPrompt timed out')),
      15000
    )
    socket.emit('createPrompt', payload, (response) => {
      clearTimeout(timeoutId)
      if (response.success) resolve(response)
      else reject(new PromptError(response.error || 'Backend error on createPrompt'))
    })
  })
}

function emitUpdatePrompt(socket: SocketManager['promptsSocket'], payload: UpdatePromptPayload) {
  return new Promise<UpdatePromptResponse>((resolve, reject) => {
    const timeoutId = setTimeout(
      () => reject(new PromptError('Request for updatePrompt timed out')),
      15000
    )
    socket.emit('updatePrompt', payload, (response) => {
      clearTimeout(timeoutId)
      if (response.success) resolve(response)
      else reject(new PromptError(response.error || 'Backend error on updatePrompt'))
    })
  })
}

function emitDeletePrompt(socket: SocketManager['promptsSocket'], payload: DeletePromptPayload) {
  return new Promise<DeletePromptResponse>((resolve, reject) => {
    const timeoutId = setTimeout(
      () => reject(new PromptError('Request for deletePrompt timed out')),
      15000
    )
    socket.emit('deletePrompt', payload, (response) => {
      clearTimeout(timeoutId)
      if (response.success) resolve(response)
      else reject(new PromptError(response.error || 'Backend error on deletePrompt'))
    })
  })
}

export function usePromptsSocket() {
  const socketManager = inject(SOCKET_MANAGER_KEY)
  if (!socketManager) {
    throw new Error('SocketManager not initialized')
  }
  const { promptsSocket } = socketManager

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

  // --- Reactive Event Handlers ---

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

  // --- Actions ---

  const fetchAllPrompts = async () => {
    isLoading.value = true
    error.value = undefined

    const result = await ResultAsync.fromPromise(emitGetPrompts(promptsSocket), mapToPromptError)

    result.match(
      (response) => {
        prompts.value = response.data
        const hasPrompts = prompts.value.length > 0
        const isNoPromptSelected = !selectedPromptId.value
        if (hasPrompts && isNoPromptSelected) {
          selectedPromptId.value = prompts.value[0].id
        }
      },
      (fetchError) => {
        error.value = fetchError.message
      }
    )

    isLoading.value = false
  }

  const createPrompt = (promptData: CreatePromptPayload) => {
    const result = ResultAsync.fromPromise(
      emitCreatePrompt(promptsSocket, promptData),
      mapToPromptError
    )
    return result.mapErr((creationError) => {
      error.value = creationError.message
      return creationError
    })
  }

  const updatePrompt = (updatePayload: UpdatePromptPayload) => {
    const result = ResultAsync.fromPromise(
      emitUpdatePrompt(promptsSocket, updatePayload),
      mapToPromptError
    )
    return result.mapErr((updateError) => {
      error.value = updateError.message
      return updateError
    })
  }

  const deletePrompt = (id: number) => {
    const result = ResultAsync.fromPromise(
      emitDeletePrompt(promptsSocket, { id }),
      mapToPromptError
    )
    return result.mapErr((deletionError) => {
      error.value = deletionError.message
      return deletionError
    })
  }

  // Lifecycle hooks
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
  }
}
