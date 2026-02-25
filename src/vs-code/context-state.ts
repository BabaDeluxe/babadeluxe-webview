import { ref } from 'vue'
import type {
  PinnedEntry,
  SuggestedEntry,
  VsCodeTextRange,
  ContextSnapshotMessage,
} from '@/vs-code/types'
import { normalizePath, compact, createPathSet } from '@/vs-code/context-utils'
import { isTextRange } from '@/vs-code/context-type-guards'

export function useContextState() {
  const pinnedById = ref(new Map<string, PinnedEntry>())
  const pinnedIdsByPath = ref(new Map<string, Set<string>>())
  const pinnedPaths = ref<string[]>([])

  const suggestedByPath = ref(new Map<string, SuggestedEntry>())
  const contextRevision = ref(0)

  const bumpContextRevision = (): void => {
    contextRevision.value += 1
  }

  const addPinToIndex = (id: string, filePath: string): void => {
    const key = normalizePath(filePath)
    if (!key) return

    const nextIndex = new Map(pinnedIdsByPath.value)
    const idsForPath = nextIndex.get(key) ?? new Set<string>()
    idsForPath.add(id)
    nextIndex.set(key, idsForPath)
    pinnedIdsByPath.value = nextIndex
  }

  const removePinFromIndex = (id: string, filePath: string): void => {
    const key = normalizePath(filePath)
    if (!key) return

    const nextIndex = new Map(pinnedIdsByPath.value)
    const idsForPath = nextIndex.get(key)
    if (idsForPath) {
      idsForPath.delete(id)
      if (idsForPath.size === 0) {
        nextIndex.delete(key)
      } else {
        nextIndex.set(key, idsForPath)
      }
    }
    pinnedIdsByPath.value = nextIndex
  }

  const upsertPinnedEntry = (entry: PinnedEntry & { id: string }): void => {
    const nextPinned = new Map(pinnedById.value)

    const existing = nextPinned.get(entry.id)
    if (existing) {
      removePinFromIndex(entry.id, existing.filePath)
    }

    nextPinned.set(entry.id, entry)
    addPinToIndex(entry.id, entry.filePath)

    pinnedById.value = nextPinned
    bumpContextRevision()
  }

  const ensurePinnedPath = (filePath: string): void => {
    const key = normalizePath(filePath)
    if (!key) return

    const existingPinnedPaths = createPathSet(pinnedPaths.value)
    if (!existingPinnedPaths.has(key)) {
      pinnedPaths.value = [...pinnedPaths.value, filePath]
    }
  }

  const unpinLocal = (filePath: string): void => {
    const cleaned = compact(filePath)
    if (!cleaned) return

    const key = normalizePath(cleaned)
    pinnedPaths.value = pinnedPaths.value.filter((p) => normalizePath(p) !== key)
    const idsToRemove = pinnedIdsByPath.value.get(key)
    if (idsToRemove) {
      const nextPinned = new Map(pinnedById.value)
      for (const id of idsToRemove) {
        nextPinned.delete(id)
      }
      pinnedById.value = nextPinned

      const nextIndex = new Map(pinnedIdsByPath.value)
      nextIndex.delete(key)
      pinnedIdsByPath.value = nextIndex
    }

    bumpContextRevision()
  }

  const pinFullFileLocal = (filePath: string, range?: VsCodeTextRange): void => {
    const cleaned = compact(filePath)
    if (!cleaned) return

    ensurePinnedPath(cleaned)
    const tempId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`

    upsertPinnedEntry({
      id: tempId,
      filePath: cleaned,
      mode: 'full',
      range,
    })
  }

  const pinSnippetLocal = (filePath: string, snippetText: string, range: VsCodeTextRange): void => {
    const cleanedPath = compact(filePath)
    const cleanedSnippet = compact(snippetText)
    if (!cleanedPath || !cleanedSnippet) return
    const tempId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`

    upsertPinnedEntry({
      id: tempId,
      filePath: cleanedPath,
      mode: 'snippet',
      snippetText: cleanedSnippet,
      range,
    })
  }

  const applySnapshot = (snapshot: ContextSnapshotMessage): void => {
    const nextPinned = new Map<string, PinnedEntry>()
    const nextIndex = new Map<string, Set<string>>()
    const nextPinnedPaths: string[] = []
    for (const pin of snapshot.pinnedFiles) {
      const filePath = compact(pin.filePath)
      if (!filePath) continue

      const id = pin.id ?? `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`
      nextPinnedPaths.push(filePath)

      const entry: PinnedEntry = {
        id,
        filePath,
        mode: 'full',
        range: isTextRange(pin.range) ? pin.range : undefined,
      }

      nextPinned.set(id, entry)

      const key = normalizePath(filePath)
      if (key) {
        const ids = nextIndex.get(key) ?? new Set<string>()
        ids.add(id)
        nextIndex.set(key, ids)
      }
    }
    for (const pin of snapshot.pinnedSnippets) {
      const filePath = compact(pin.filePath)
      const snippetText = compact(pin.snippet)
      if (!filePath || !snippetText || !isTextRange(pin.range)) continue

      const id = pin.id ?? `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`

      const entry: PinnedEntry = {
        id,
        filePath,
        mode: 'snippet',
        snippetText,
        range: pin.range,
      }

      nextPinned.set(id, entry)

      const key = normalizePath(filePath)
      if (key) {
        const ids = nextIndex.get(key) ?? new Set<string>()
        ids.add(id)
        nextIndex.set(key, ids)
      }
    }

    pinnedPaths.value = nextPinnedPaths
    pinnedById.value = nextPinned
    pinnedIdsByPath.value = nextIndex
    bumpContextRevision()
  }

  const clearAllState = (): void => {
    pinnedPaths.value = []
    pinnedById.value = new Map()
    pinnedIdsByPath.value = new Map()
    suggestedByPath.value = new Map()
    bumpContextRevision()
  }

  return {
    pinnedPaths,
    pinnedById,
    pinnedIdsByPath,
    suggestedByPath,
    contextRevision,
    bumpContextRevision,
    upsertPinnedEntry,
    ensurePinnedPath,
    unpinLocal,
    pinFullFileLocal,
    pinSnippetLocal,
    applySnapshot,
    clearAllState,
  }
}
