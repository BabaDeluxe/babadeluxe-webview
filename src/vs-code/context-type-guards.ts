import type {
  VsCodeTextRange,
  AutoContextResponse,
  FileContextResponse,
  ContextPinFileMessage,
  ContextPinSnippetMessage,
  ContextSnapshotMessage,
  AuthErrorIncomingMessage,
  AuthSessionIncomingMessage,
  GitCommitMessageContext,
  GitPrMessageContext,
  ActiveEditorChangedMessage,
  EditorDiagnosticsMessage,
  IncomingMessage,
} from '@/vs-code/types'

export const isTextRange = (value: unknown): value is VsCodeTextRange => {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v['startLine'] === 'number' &&
    typeof v['startCharacter'] === 'number' &&
    typeof v['endLine'] === 'number' &&
    typeof v['endCharacter'] === 'number'
  )
}

export const isContextSnapshotMessage = (msg: IncomingMessage): msg is ContextSnapshotMessage =>
  msg.type === 'context:snapshot'

export const isAutoContextResponse = (msg: IncomingMessage): msg is AutoContextResponse =>
  msg.type === 'autoContext:response'

export const isFileContextResponse = (msg: IncomingMessage): msg is FileContextResponse =>
  msg.type === 'fileContext:response'

export const isContextPinFileMessage = (msg: IncomingMessage): msg is ContextPinFileMessage =>
  msg.type === 'context:pinFile'

export const isContextPinSnippetMessage = (msg: IncomingMessage): msg is ContextPinSnippetMessage =>
  msg.type === 'context:pinSnippet'

export const isAuthErrorMessage = (msg: IncomingMessage): msg is AuthErrorIncomingMessage =>
  msg.type === 'auth.error'

export const isAuthSessionMessage = (msg: IncomingMessage): msg is AuthSessionIncomingMessage =>
  msg.type === 'auth.session'

export const isGitCommitMessageContext = (msg: IncomingMessage): msg is GitCommitMessageContext =>
  msg.type === 'git:commitMessageContext'

export const isGitPrMessageContext = (msg: IncomingMessage): msg is GitPrMessageContext =>
  msg.type === 'git:prMessageContext'

/** Guard for active editor change notifications from the extension host. */
export const isActiveEditorChangedMessage = (
  msg: IncomingMessage
): msg is ActiveEditorChangedMessage => msg.type === 'editor:activeChanged'

/** Guard for diagnostics notifications from the extension host. */
export const isEditorDiagnosticsMessage = (msg: IncomingMessage): msg is EditorDiagnosticsMessage =>
  msg.type === 'editor:diagnostics'

export const isVsCodeContextItem = (
  value: unknown
): value is { id: string; filePath: string; kind: 'pinned' | 'suggested' } => {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v['id'] === 'string' &&
    typeof v['filePath'] === 'string' &&
    (v['kind'] === 'pinned' || v['kind'] === 'suggested')
  )
}

export const isResponseWithRequestId = (value: unknown): value is { requestId: string } => {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v['requestId'] === 'string'
}
