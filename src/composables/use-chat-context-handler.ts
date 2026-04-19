import { storeToRefs } from 'pinia'
import { type Ref } from 'vue'
import { useVsCodeContextStore } from '@/stores/use-vs-code-context-store'
import type { ContextReference, Message } from '@/database/types'
import { isVsCodeContextItem } from '@/vs-code/context-type-guards'
import type { AbstractLogger } from '@/logger'
import { createStreamingCommitHandler } from '@/streaming-helpers'
import { streamingCommitIntervalMs } from '@/constants'
import type { StreamingMessageComponent } from '@/streaming-helpers'
import type { LockedContextReference } from '@/vs-code/types'

type FormattedContextItem = { kind: 'file' | 'snippet'; filePath: string; content: string }

type PreparedChatRequest = {
  contextReferences: ContextReference[]
  contextItems: FormattedContextItem[]
  onChunk: ReturnType<typeof createStreamingCommitHandler>
}

export function useChatContextHandler(
  logger: AbstractLogger,
  currentConversationId: Ref<number>,
  currentUserId: Ref<string | undefined>,
  messages: Ref<Message[]>,
  messageComponents: Ref<Map<number, StreamingMessageComponent>>
) {
  const vsCodeContext = useVsCodeContextStore()
  const { isInVsCode, contextItems, contextError, contextRevision, isLoadingContext } =
    storeToRefs(vsCodeContext)
  const {
    toggleLocked,
    refreshSuggestions,
    getLockedReferences,
    resolveFilesFromDocument,
    removeContextItem,
    clearAllContext,
  } = vsCodeContext

  function toContextReference(refLocked: LockedContextReference): ContextReference | undefined {
    if (refLocked.kind === 'file') {
      const cleaned = refLocked.filePath.trim()
      if (!cleaned) return undefined
      return { type: 'file', filePath: cleaned }
    }

    const cleanedSnippet = refLocked.snippetText.trim()
    if (!cleanedSnippet) return undefined

    const cleanedPath = refLocked.filePath.trim()
    return cleanedPath.length > 0
      ? { type: 'snippet', filePath: cleanedPath, snippetText: cleanedSnippet }
      : { type: 'snippet', snippetText: cleanedSnippet }
  }

  const prepareChatRequest = async (): Promise<PreparedChatRequest> => {
    const locked = getLockedReferences()

    const lockedFilePaths = locked
      .filter((refLocked) => refLocked.kind === 'file')
      .map((refLocked) => refLocked.filePath)

    const lockedSnippets = locked
      .filter((refLocked) => refLocked.kind === 'snippet')
      .map((refLocked) => ({
        filePath: refLocked.filePath,
        snippetText: refLocked.snippetText,
      }))

    const resolvedFilesResult = await resolveFilesFromDocument(lockedFilePaths)
    const resolvedFiles = resolvedFilesResult.isOk() ? resolvedFilesResult.value : []

    const contextReferences: ContextReference[] = locked
      .map(toContextReference)
      .filter((ref): ref is ContextReference => ref !== undefined)

    const contextItems: FormattedContextItem[] = [
      ...resolvedFiles.map((file) => ({
        kind: 'file' as const,
        filePath: file.filePath,
        content: file.content,
      })),
      ...lockedSnippets.map((snippet) => ({
        kind: 'snippet' as const,
        filePath: snippet.filePath,
        content: snippet.snippetText,
      })),
    ]

    const onChunk = createStreamingCommitHandler(
      messages,
      messageComponents,
      streamingCommitIntervalMs
    )

    return { contextReferences, contextItems, onChunk }
  }

  const handleRemoveContextItem = (payload: unknown) => {
    if (isVsCodeContextItem(payload)) {
      removeContextItem(payload)
      return
    }

    if (typeof payload === 'string') {
      const item = contextItems.value.find((i) => i.id === payload)
      if (item) {
        removeContextItem(item)
        return
      }

      logger.warn('Context item removal failed: unknown id', {
        conversationId: currentConversationId.value,
        userId: currentUserId.value,
        itemId: payload,
      })
      return
    }

    logger.warn('Context item removal failed: unsupported payload', {
      conversationId: currentConversationId.value,
      userId: currentUserId.value,
      payload: JSON.stringify(payload),
    })
  }

  const handleClearAllContext = () => {
    clearAllContext()
  }

  const handleToggleLock = (filePath: string) => {
    toggleLocked(filePath)
  }

  return {
    isInVsCode,
    contextItems,
    contextError,
    contextRevision,
    isLoadingContext,
    refreshSuggestions,
    prepareChatRequest,
    handleRemoveContextItem,
    handleClearAllContext,
    handleToggleLock,
    clearAllContext,
  }
}
