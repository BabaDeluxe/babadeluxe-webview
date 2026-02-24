import type { VsCodeTextRange } from '@/vs-code/types'

export const normalizePath = (path: string): string => {
  if (!path) return ''
  let normalized = path.replace(/\\/g, '/')
  if (normalized.length > 3 && normalized.endsWith('/')) normalized = normalized.slice(0, -1)
  if (typeof navigator !== 'undefined' && navigator.platform?.startsWith('Win')) {
    normalized = normalized.toLowerCase()
  }
  return normalized
}

export const compact = (s: string): string => s.trim()
export const uniqueStrings = (items: readonly string[]): string[] => [...new Set(items)]
export const makeId = (): string => `${Date.now()}-${Math.random().toString(16).slice(2)}`

export const createPathSet = (paths: readonly string[]): Set<string> =>
  new Set(paths.map(normalizePath).filter((p) => p.length > 0))

export function pickBetterRange(
  first: VsCodeTextRange | undefined,
  second: VsCodeTextRange | undefined
): VsCodeTextRange | undefined {
  if (!first) return second
  if (!second) return first

  if (second.startLine < first.startLine) return second
  if (second.startLine > first.startLine) return first
  if (second.startCharacter < first.startCharacter) return second
  return first
}

export function toStableFileId(filePath: string): string {
  return `file:${normalizePath(filePath)}`
}
