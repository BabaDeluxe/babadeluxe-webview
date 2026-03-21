import { z } from 'zod/v4'
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

const textRangeSchema = z.object({
  startLine: z.number(),
  startCharacter: z.number(),
  endLine: z.number(),
  endCharacter: z.number(),
})

export const isTextRange = (value: unknown): value is VsCodeTextRange => {
  return textRangeSchema.safeParse(value).success
}

const responseWithRequestIdSchema = z.object({
  type: z.enum(['autoContext:response', 'fileContext:response']),
  requestId: z.string(),
})

export const isResponseWithRequestId = (
  msg: IncomingMessage
): msg is AutoContextResponse | FileContextResponse => {
  return responseWithRequestIdSchema.safeParse(msg).success
}

const contextSnapshotMessageSchema = z.object({
  type: z.literal('context:snapshot'),
  pinnedFiles: z.array(
    z.object({
      id: z.string(),
      filePath: z.string(),
      range: textRangeSchema.optional(),
    })
  ),
  pinnedSnippets: z.array(
    z.object({
      id: z.string(),
      filePath: z.string(),
      snippet: z.string(),
      range: textRangeSchema,
    })
  ),
})

export const isContextSnapshotMessage = (msg: IncomingMessage): msg is ContextSnapshotMessage => {
  return contextSnapshotMessageSchema.safeParse(msg).success
}

const contextPinFileMessageSchema = z.object({
  type: z.literal('context:pinFile'),
  filePath: z.string(),
})

export const isContextPinFileMessage = (msg: IncomingMessage): msg is ContextPinFileMessage => {
  return contextPinFileMessageSchema.safeParse(msg).success
}

const contextPinSnippetMessageSchema = z.object({
  type: z.literal('context:pinSnippet'),
  id: z.string(),
  filePath: z.string(),
  snippet: z.string(),
  range: textRangeSchema,
})

export const isContextPinSnippetMessage = (
  msg: IncomingMessage
): msg is ContextPinSnippetMessage => {
  return contextPinSnippetMessageSchema.safeParse(msg).success
}

const vsCodeContextItemSchema = z.object({
  id: z.string(),
  filePath: z.string(),
  kind: z.enum(['pinned', 'suggested']),
})

export const isVsCodeContextItem = (value: unknown): value is VsCodeContextItem => {
  return vsCodeContextItemSchema.safeParse(value).success
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null
