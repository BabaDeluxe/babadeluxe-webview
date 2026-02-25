import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useEventListener } from '@vueuse/core'
import { err, ok, type Result } from 'neverthrow'
import { getVsCodeApi } from '@/vs-code/api'
import type { ValidationError } from '@/errors'
import { NetworkError } from '@/errors'
import { socketTimeoutMs } from '@/constants'
import { logger } from '@/logger'
import type {
  VsCodeContextItem,
  LockedContextReference,
  IncomingMessage,
  SidebarReadyMessage,
  ContextUnpinFileMessage,
  ContextClearAllMessage,
  AutoContextRequest,
  FileContextResolveRequest,
  ContextPinFileMessage,
  SuggestedEntry,
} from '@/vs-code/types'
import {
  isResponseWithRequestId,
  isContextSnapshotMessage,
  isContextPinFileMessage,
  isContextPinSnippetMessage,
  isTextRange,
} from '@/vs-code/context-type-guards'
import {
  normalizePath,
  compact,
  uniqueStrings,
  makeId,
  createPathSet,
  pickBetterRange,
  toStableFileId,
} from '@/vs-code/context-utils'
import { useContextState } from '@/vs-code/context-state'
import { useIsInVsCode } from '@/composables/use-is-in-vs-code'

export type { VsCodeTextRange, VsCodeContextItem, LockedContextReference } from '@/vs-code/types'

type PendingResolver = (result: Result<unknown[], NetworkError | ValidationError>) => void

export const useVsCodeContextStore = defineStore('vsCodeContext', () => {
  const state = useContextState()
  const {
    pinnedPaths,
    pinnedById,
    pinnedIdsByPath,
    suggestedByPath,
    contextRevision,
    bumpContextRevision,
    unpinLocal,
    pinFullFileLocal,
    pinSnippetLocal,
    applySnapshot,
    clearAllState,
  } = state

  const { isInVsCode } = useIsInVsCode()

  const isLoadingContext = ref(false)
  const contextError = ref<string>()

  const pending = new Map<string, PendingResolver>()

  let latestSuggestionSequence = 0
  let latestRebuildSequence = 0

  const postToVsCode = (message: object): void => {
    const apiResult = getVsCodeApi()
    if (apiResult.isErr()) {
      logger.warn('Cannot post message to VS Code', {
        messageType: (message as { type?: string }).type,
        error: apiResult.error,
      })
      return
    }
    apiResult.value.postMessage(message)
  }

  const toggleLocked = (filePath: string): void => {
    const cleaned = compact(filePath)
    if (!cleaned) return

    const key = normalizePath(cleaned)
    const isLocked = pinnedIdsByPath.value.has(key)

    if (isLocked) {
      unpinLocal(cleaned)
      const message: ContextUnpinFileMessage = { type: 'context:unpinFile', filePath: cleaned }
      postToVsCode(message)
      return
    }

    pinFullFileLocal(cleaned)
    const message: ContextPinFileMessage = { type: 'context:pinFile', filePath: cleaned }
    postToVsCode(message)
  }

  const handleVsCodeMessage = (event: MessageEvent) => {
    const message = event.data as IncomingMessage

    if (isContextSnapshotMessage(message)) {
      applySnapshot(message)
      return
    }

    if (isContextPinFileMessage(message)) {
      pinFullFileLocal(message.filePath)
      return
    }

    if (isContextPinSnippetMessage(message)) {
      pinSnippetLocal(message.filePath, message.snippet, message.range)
      return
    }

    if (!isResponseWithRequestId(message)) return

    const resolve = pending.get(message.requestId)
    if (!resolve) return

    pending.delete(message.requestId)

    if ('error' in message && typeof message.error === 'string' && message.error.length > 0) {
      resolve(err(new NetworkError(message.error)))
      return
    }

    resolve(ok(message.items ?? []))
  }

  const postAndAwait = async (
    request: AutoContextRequest | FileContextResolveRequest,
    timeoutMs: number = socketTimeoutMs.vsCodeContext
  ): Promise<Result<unknown[], NetworkError>> => {
    const apiResult = getVsCodeApi()
    if (apiResult.isErr()) return err(apiResult.error)

    const vsCodeApi = apiResult.value
    const requestId = request.requestId
    const requestType = request.type

    return await new Promise<Result<unknown[], NetworkError>>((resolve) => {
      let didFinish = false

      const finish = (result: Result<unknown[], NetworkError>) => {
        if (didFinish) return
        didFinish = true
        pending.delete(requestId)
        resolve(result)
      }

      const timeoutId = setTimeout(() => {
        finish(
          err(
            new NetworkError(
              `VS Code context request timed out after ${timeoutMs}ms: ${requestType} (${requestId})`
            )
          )
        )
      }, timeoutMs)

      pending.set(requestId, (result) => {
        clearTimeout(timeoutId)
        finish(result)
      })

      vsCodeApi.postMessage(request)
    })
  }

  const resolveFilesFromDocument = async (
    filePaths: readonly string[],
    timeoutMs = socketTimeoutMs.vsCodeFileResolve
  ): Promise<
    Result<Array<{ filePath: string; content: string }>, NetworkError | ValidationError>
  > => {
    const cleaned = uniqueStrings(filePaths.map(compact).filter((path) => path.length > 0))
    if (cleaned.length === 0) return ok([])

    const requestId = makeId()
    const result = await postAndAwait(
      { type: 'fileContext:resolve', requestId, filePaths: cleaned },
      timeoutMs
    )
    if (result.isErr()) return err(result.error)

    const resolved: Array<{ filePath: string; content: string }> = []
    for (const raw of result.value) {
      const item = raw as { filePath?: unknown; snippet?: unknown }
      if (typeof item.filePath !== 'string' || item.filePath.trim().length === 0) continue
      if (typeof item.snippet !== 'string') continue
      resolved.push({ filePath: item.filePath, content: item.snippet })
    }

    return ok(resolved)
  }

  const removeContextItem = (item: VsCodeContextItem): void => {
    const cleanedPath = compact(item.filePath)
    if (!cleanedPath) return

    if (item.kind === 'pinned') {
      unpinLocal(cleanedPath)
      const message: ContextUnpinFileMessage = {
        type: 'context:unpinFile',
        filePath: cleanedPath,
      }
      postToVsCode(message)
      return
    }

    const key = normalizePath(cleanedPath)
    const nextSuggested = new Map(suggestedByPath.value)
    nextSuggested.delete(key)
    suggestedByPath.value = nextSuggested
    bumpContextRevision()
  }

  const clearAllContext = (): void => {
    clearAllState()
    contextError.value = undefined

    const message: ContextClearAllMessage = { type: 'context:clearAll' }
    postToVsCode(message)
  }

  const rebuildPinnedItems = async (): Promise<Result<void, never>> => {
    const rebuildSequence = ++latestRebuildSequence

    if (!isInVsCode.value) {
      if (rebuildSequence === latestRebuildSequence) {
        pinnedById.value = new Map()
        pinnedIdsByPath.value = new Map()
      }
      return ok(undefined)
    }

    return ok(undefined)
  }

  const refreshSuggestions = async (promptText: string): Promise<Result<void, NetworkError>> => {
    const suggestionSequence = ++latestSuggestionSequence

    if (!isInVsCode.value) {
      if (suggestionSequence === latestSuggestionSequence) {
        suggestedByPath.value = new Map()
        contextError.value = undefined
        isLoadingContext.value = false
      }
      return ok(undefined)
    }

    isLoadingContext.value = true
    contextError.value = undefined

    const finalize = (result: Result<void, NetworkError>): Result<void, NetworkError> => {
      if (suggestionSequence !== latestSuggestionSequence) return result
      isLoadingContext.value = false
      return result
    }

    const trimmed = compact(promptText)
    if (!trimmed) {
      if (suggestionSequence === latestSuggestionSequence) {
        suggestedByPath.value = new Map()
        isLoadingContext.value = false
      }
      return ok(undefined)
    }

    const requestId = makeId()
    const result = await postAndAwait({ type: 'autoContext:request', requestId, query: trimmed })

    if (result.isErr()) {
      if (suggestionSequence === latestSuggestionSequence) {
        contextError.value = result.error.message
        suggestedByPath.value = new Map()
      }
      return finalize(err(result.error))
    }

    const allLockedNormalized = createPathSet([
      ...pinnedPaths.value,
      ...[...pinnedById.value.values()].map((entry) => entry.filePath),
    ])

    const nextSuggested = new Map<string, SuggestedEntry>()
    for (const raw of result.value) {
      const item = raw as { filePath?: unknown; score?: unknown; matchRange?: unknown }
      if (typeof item.filePath !== 'string') continue
      const cleanedPath = compact(item.filePath)
      if (!cleanedPath) continue

      const key = normalizePath(cleanedPath)
      if (allLockedNormalized.has(key)) continue

      const score = typeof item.score === 'number' && Number.isFinite(item.score) ? item.score : 0
      const matchRange = isTextRange(item.matchRange) ? item.matchRange : undefined

      const existing = nextSuggested.get(key)
      if (!existing || score > existing.score) {
        nextSuggested.set(key, { filePath: cleanedPath, score, matchRange })
        continue
      }

      if (score === existing.score) {
        nextSuggested.set(key, {
          ...existing,
          matchRange: pickBetterRange(existing.matchRange, matchRange),
        })
      }
    }

    if (suggestionSequence === latestSuggestionSequence) {
      suggestedByPath.value = nextSuggested
    }
    return finalize(ok(undefined))
  }

  const contextItems = computed<VsCodeContextItem[]>(() => {
    const results: VsCodeContextItem[] = []

    for (const entry of pinnedById.value.values()) {
      results.push({
        id: entry.id,
        kind: 'pinned',
        filePath: entry.filePath,
        matchRange: entry.range,
      })
    }

    const pinnedPathSet = new Set(pinnedIdsByPath.value.keys())

    const suggestedList: VsCodeContextItem[] = []
    for (const entry of suggestedByPath.value.values()) {
      const key = normalizePath(entry.filePath)
      if (pinnedPathSet.has(key)) continue

      suggestedList.push({
        id: toStableFileId(entry.filePath),
        kind: 'suggested',
        filePath: entry.filePath,
        score: entry.score,
        matchRange: entry.matchRange,
      })
    }

    suggestedList.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    return results.concat(suggestedList)
  })

  const pinnedItems = computed(() => contextItems.value.filter((item) => item.kind === 'pinned'))
  const suggestedItems = computed(() =>
    contextItems.value.filter((item) => item.kind === 'suggested')
  )

  const getLockedReferences = (): LockedContextReference[] => {
    const result: LockedContextReference[] = []

    for (const entry of pinnedById.value.values()) {
      if (entry.mode === 'full') {
        result.push({ kind: 'file', filePath: entry.filePath })
        continue
      }

      if (entry.mode === 'snippet' && entry.snippetText) {
        result.push({
          kind: 'snippet',
          filePath: entry.filePath,
          snippetText: entry.snippetText,
          range: entry.range,
        })
      }
    }

    return result
  }

  useEventListener(window, 'message', handleVsCodeMessage)

  const notifySidebarReady = (): void => {
    const message: SidebarReadyMessage = { type: 'sidebar.ready' }
    postToVsCode(message)
  }

  notifySidebarReady()
  void rebuildPinnedItems()

  return {
    // state / flags
    isInVsCode,
    isLoadingContext,
    contextError,
    contextRevision,

    // derived
    contextItems,
    pinnedItems,
    suggestedItems,

    // actions
    toggleLocked,
    removeContextItem,
    clearAllContext,
    refreshSuggestions,
    getLockedReferences,
    resolveFilesFromDocument,
  }
})
