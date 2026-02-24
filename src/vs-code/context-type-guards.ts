import type {
  VsCodeTextRange,
  IncomingMessage,
  AutoContextResponse,
  FileContextResponse,
  ContextSnapshotMessage,
  ContextPinFileMessage,
  ContextPinSnippetMessage,
  VsCodeContextItem,
} from '@/vs-code/types'

export const isTextRange = (value: unknown): value is VsCodeTextRange => {
  if (typeof value !== 'object' || value === null) return false
  const maybe = value as Partial<VsCodeTextRange>
  return (
    typeof maybe.startLine === 'number' &&
    typeof maybe.startCharacter === 'number' &&
    typeof maybe.endLine === 'number' &&
    typeof maybe.endCharacter === 'number' &&
    Number.isFinite(maybe.startLine) &&
    Number.isFinite(maybe.startCharacter) &&
    Number.isFinite(maybe.endLine) &&
    Number.isFinite(maybe.endCharacter)
  )
}

export const isResponseWithRequestId = (
  msg: IncomingMessage
): msg is AutoContextResponse | FileContextResponse =>
  (msg.type === 'autoContext:response' || msg.type === 'fileContext:response') &&
  'requestId' in msg &&
  typeof (msg as { requestId: unknown }).requestId === 'string'

export const isContextSnapshotMessage = (msg: IncomingMessage): msg is ContextSnapshotMessage =>
  msg.type === 'context:snapshot' &&
  'pinnedFiles' in msg &&
  Array.isArray((msg as { pinnedFiles?: unknown }).pinnedFiles) &&
  'pinnedSnippets' in msg &&
  Array.isArray((msg as { pinnedSnippets?: unknown }).pinnedSnippets)

export const isContextPinFileMessage = (msg: IncomingMessage): msg is ContextPinFileMessage =>
  msg.type === 'context:pinFile' &&
  'filePath' in msg &&
  typeof (msg as { filePath: unknown }).filePath === 'string'

export const isContextPinSnippetMessage = (msg: IncomingMessage): msg is ContextPinSnippetMessage =>
  msg.type === 'context:pinSnippet' &&
  'id' in msg &&
  'filePath' in msg &&
  'snippet' in msg &&
  'range' in msg &&
  typeof (msg as { id: unknown }).id === 'string' &&
  typeof (msg as { filePath: unknown }).filePath === 'string' &&
  typeof (msg as { snippet: unknown }).snippet === 'string' &&
  isTextRange((msg as { range: unknown }).range)

export const isVsCodeContextItem = (value: unknown): value is VsCodeContextItem => {
  if (!isRecord(value)) return false
  return (
    typeof value['id'] === 'string' &&
    typeof value['filePath'] === 'string' &&
    (value['kind'] === 'pinned' || value['kind'] === 'suggested')
  )
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null
