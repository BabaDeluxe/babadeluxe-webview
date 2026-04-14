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
