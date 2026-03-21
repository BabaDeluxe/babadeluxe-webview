import type { ContextReference } from '@/database/types'
import { logger } from '@/logger'
import { safeJsonParse } from '@babadeluxe/shared'
import { z } from 'zod'

const fileRefSchema = z.object({
  type: z.literal('file'),
  filePath: z.string(),
})

const snippetRefSchema = z.object({
  type: z.literal('snippet'),
  snippetText: z.string(),
  filePath: z.string().optional(),
})

const contextReferenceSchema = z.discriminatedUnion('type', [fileRefSchema, snippetRefSchema])

const contextReferencesArraySchema = z.array(contextReferenceSchema)

export function encodeContextReferences(refs: ContextReference[] | undefined): string | undefined {
  if (!refs) return undefined

  // Map each reference to a plain JSON-serializable object
  const plain = refs.map((ref) => {
    if (ref.type === 'file') {
      return { type: 'file' as const, filePath: ref.filePath }
    }

    const base: { type: 'snippet'; snippetText: string; filePath?: string } = {
      type: 'snippet',
      snippetText: ref.snippetText,
    }
    if (ref.filePath) {
      base.filePath = ref.filePath
    }
    return base
  })

  return JSON.stringify(plain)
}

export function decodeContextReferences(raw: string | undefined): ContextReference[] | undefined {
  if (!raw) return undefined

  // 1. Parse the JSON string
  const parseResult = safeJsonParse(raw)
  if (parseResult.isErr()) {
    logger.error('Failed to parse context references JSON', parseResult.error)
    return undefined
  }

  const data = parseResult.value

  // 2. Validate the shape with Zod
  const validationResult = contextReferencesArraySchema.safeParse(data)
  if (!validationResult.success) {
    logger.error('Invalid context references structure', validationResult.error)
    return undefined
  }

  // validationResult.data is now typed as ContextReference[]
  return validationResult.data
}
