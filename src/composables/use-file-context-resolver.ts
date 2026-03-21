import { ref } from 'vue'
import { err, ok, type Result } from 'neverthrow'
import { getVsCodeApi } from '@/vs-code/api'
import type { ContextReference } from '@/database/types'
import { type FileContextResponse, type IncomingMessage } from '@/vs-code/types'
import { isResponseWithRequestId } from '@/vs-code/context-type-guards'
import { ValidationError } from '@/errors'
import { socketTimeoutMs } from '@/constants'
import { useTrackedTimeouts } from '@/composables/use-tracked-timeouts'

type ResolvedContextItem = {
  filePath: string
  content: string
}

type PendingRequest = {
  resolve: (value: Result<ResolvedContextItem[], ValidationError>) => void
}

const pendingRequests = new Map<string, PendingRequest>()
const isListenerAttached = ref(false)

function generateRequestId(): string {
  return `fileContext:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`
}

function ensureListenerAttached(): void {
  if (isListenerAttached.value) return

  window.addEventListener('message', (event: MessageEvent<IncomingMessage>) => {
    const message = event.data
    if (!isResponseWithRequestId(message)) return
    if (message.type !== 'fileContext:response') return

    const pending = pendingRequests.get(message.requestId)
    if (!pending) return

    pendingRequests.delete(message.requestId)

    const response = message as FileContextResponse

    if (response.error) {
      pending.resolve(err(new ValidationError(`Failed to resolve file context: ${response.error}`)))
      return
    }

    const rawItems = response.items ?? []
    const items: ResolvedContextItem[] = rawItems
      .filter((item) => item.filePath && item.snippet)
      .map((item) => ({
        filePath: item.filePath as string,
        content: item.snippet as string,
      }))

    pending.resolve(ok(items))
  })

  isListenerAttached.value = true
}

export function useFileContextResolver() {
  ensureListenerAttached()

  const { createTimeout, cancelTimeout } = useTrackedTimeouts()

  async function resolveFromReferences(
    references: ContextReference[]
  ): Promise<Result<ResolvedContextItem[], ValidationError>> {
    if (references.length === 0) return ok([])

    const filePaths = Array.from(
      new Set(
        references
          .map((ref) => ref.filePath?.trim())
          .filter((p): p is string => !!p && p.length > 0)
      )
    )

    if (filePaths.length === 0) {
      return err(new ValidationError('No valid file paths in context references'))
    }

    const apiResult = getVsCodeApi()
    if (apiResult.isErr()) {
      return err(new ValidationError('VS Code API not available', apiResult.error))
    }

    const requestId = generateRequestId()

    const promise = new Promise<Result<ResolvedContextItem[], ValidationError>>((resolve) => {
      const timeoutId = createTimeout(() => {
        pendingRequests.delete(requestId)
        resolve(err(new ValidationError('Timeout waiting for file context from VS Code')))
      }, socketTimeoutMs.vsCodeFileResolve)

      pendingRequests.set(requestId, {
        resolve: (result) => {
          cancelTimeout(timeoutId)
          resolve(result)
        },
      })

      apiResult.value.postMessage({
        type: 'fileContext:resolve',
        requestId,
        filePaths,
      })
    })

    return promise
  }

  return {
    resolveFromReferences,
  }
}
