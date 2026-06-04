import { z } from 'zod'

export type VsCodeTextRange = Readonly<{
  startLine: number
  startCharacter: number
  endLine: number
  endCharacter: number
}>

export type VsCodeContextItem = Readonly<{
  readonly id: string
  readonly kind: 'pinned' | 'suggested'
  readonly filePath: string
  readonly score?: number
  readonly matchRange?: VsCodeTextRange
}>

export type LockedContextReference =
  | Readonly<{ kind: 'file'; filePath: string }>
  | Readonly<{ kind: 'snippet'; filePath: string; snippetText: string; range?: VsCodeTextRange }>

export type SidebarReadyMessage = Readonly<{ type: 'sidebar.ready' }>

export type ContextSnapshotMessage = Readonly<{
  type: 'context:snapshot'
  pinnedFiles: Array<{
    id: string
    filePath: string
    range?: VsCodeTextRange
  }>
  pinnedSnippets: Array<{
    id: string
    filePath: string
    snippet: string
    range: VsCodeTextRange
  }>
}>

export type ContextUnpinFileMessage = Readonly<{
  type: 'context:unpinFile'
  filePath: string
}>

export type ContextClearAllMessage = Readonly<{
  type: 'context:clearAll'
}>

export type AutoContextRequest = Readonly<{
  type: 'autoContext:request'
  requestId: string
  query: string
}>

export type AutoContextResponse = Readonly<{
  type: 'autoContext:response'
  requestId: string
  error?: string
  items?: Array<{
    filePath?: string
    score?: number
    matchRange?: VsCodeTextRange
  }>
}>

export type FileContextResolveRequest = Readonly<{
  type: 'fileContext:resolve'
  requestId: string
  filePaths: string[]
}>

export type FileContextResponse = Readonly<{
  type: 'fileContext:response'
  requestId: string
  error?: string
  items?: Array<{
    filePath?: string
    snippet?: string
  }>
}>

export type ContextPinFileMessage = Readonly<{
  type: 'context:pinFile'
  filePath: string
}>

export type ContextPinSnippetMessage = Readonly<{
  type: 'context:pinSnippet'
  id: string
  filePath: string
  snippet: string
  range: VsCodeTextRange
}>

export const authSessionPayloadSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAtUnixSeconds: z.number().optional(),
})

export const authErrorIncomingMessageSchema = z.object({
  type: z.literal('auth.error'),
  message: z.string().optional(),
})

export const authSessionIncomingMessageSchema = z.object({
  type: z.literal('auth.session'),
  session: authSessionPayloadSchema,
})

export const incomingAuthMessageSchema = z.union([
  authErrorIncomingMessageSchema,
  authSessionIncomingMessageSchema,
])

export type AuthErrorIncomingMessage = z.infer<typeof authErrorIncomingMessageSchema>
export type AuthSessionIncomingMessage = z.infer<typeof authSessionIncomingMessageSchema>
export type IncomingAuthMessage = z.infer<typeof incomingAuthMessageSchema>

// --- Git: Commit message ---
export type GitCommitMessageContext = Readonly<{
  type: 'git:commitMessageContext'
  diff: string
  currentMessage: string
}>

// --- Git: PR message ---
export type GitPrMessageContext = Readonly<{
  type: 'git:prMessageContext'
  headBranch: string
  baseBranch: string
  diff: string
  commitMessages: string[]
}>

// --- Outbound results (webview → extension) ---
export type GitCommitMessageResult = Readonly<{
  type: 'git:commitMessageResult'
  message: string
}>

export type GitPrMessageResult = Readonly<{
  type: 'git:prMessageResult'
  title: string
  body: string
}>

// --- Active editor (extension → webview) ---
/**
 * Sent by the extension whenever the active text editor changes or the
 * sidebar panel becomes visible. The webview tracks this as an ephemeral
 * "active" context entry (distinct from pinned entries) so the AI always
 * knows which file the developer is currently looking at.
 *
 * Rules:
 * - Only file:// URIs are forwarded by the extension.
 * - The webview stores at most ONE active entry at a time (replaced on
 *   each message).
 * - If the filePath is already present in the pinned set the active entry
 *   is suppressed to avoid duplicates.
 * - `languageId` is forwarded to the socket payload for syntax-aware AI
 *   responses.
 */
export type ActiveEditorChangedMessage = Readonly<{
  type: 'editor:activeChanged'
  filePath: string
  cursorLine: number
  visibleRange: VsCodeTextRange
  languageId: string
}>

// --- Diagnostics (extension → webview) ---
export type DiagnosticItem = Readonly<{
  message: string
  severity: 'error' | 'warning'
  range: VsCodeTextRange
  source?: string
  code?: string
}>

/**
 * Sent by the extension whenever diagnostics change for a file that is
 * currently open. The webview stores these silently in a `diagnosticsMap`
 * keyed by filePath and merges them into the socket payload when the
 * relevant file is in context (active or pinned).
 *
 * An empty `diagnostics` array clears a previously stored entry.
 */
export type EditorDiagnosticsMessage = Readonly<{
  type: 'editor:diagnostics'
  filePath: string
  diagnostics: ReadonlyArray<DiagnosticItem>
}>

export type UnknownIncomingMessage = Readonly<{
  type: string
}>

export type IncomingMessage =
  | ContextSnapshotMessage
  | AutoContextResponse
  | FileContextResponse
  | ContextPinFileMessage
  | ContextPinSnippetMessage
  | AuthErrorIncomingMessage
  | AuthSessionIncomingMessage
  | GitCommitMessageContext
  | GitPrMessageContext
  | ActiveEditorChangedMessage
  | EditorDiagnosticsMessage
  | UnknownIncomingMessage

export type PinnedEntry = Readonly<{
  id: string
  filePath: string
  mode: 'full' | 'snippet'
  snippetText?: string
  range?: VsCodeTextRange
}>

export type SuggestedEntry = Readonly<{
  filePath: string
  score: number
  matchRange?: VsCodeTextRange
}>

/** Ephemeral entry representing the file open in the active editor. */
export type ActiveEditorEntry = Readonly<{
  filePath: string
  cursorLine: number
  visibleRange: VsCodeTextRange
  languageId: string
}>
