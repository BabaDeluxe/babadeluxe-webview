import { BaseError, NetworkError, RateLimitError, AuthError } from '@/errors'
import { z } from 'zod'

// Define schemas for each error type
const rateLimitErrorSchema = z.instanceof(RateLimitError)
const networkErrorSchema = z.instanceof(NetworkError)
const authErrorSchema = z.instanceof(AuthError)
const baseErrorSchema = z.instanceof(BaseError)
const errorSchema = z.instanceof(Error)
const stringSchema = z.string()

export function toUserMessage(error: unknown, fallback = 'An unexpected error occurred.'): string {
  if (stringSchema.safeParse(error).success) return error as string
  if (rateLimitErrorSchema.safeParse(error).success) return 'Rate limit exceeded. Please slow down.'
  if (networkErrorSchema.safeParse(error).success)
    return 'Unable to connect to the server. Please check your connection.'
  if (authErrorSchema.safeParse(error).success) {
    return 'Your session has expired or is invalid. Please sign in again.'
  }

  // Strip [Namespace] prefix from BaseErrors if present
  if (baseErrorSchema.safeParse(error).success) {
    const err = error as BaseError
    const match = err.message.match(/^\[.*?\]\s(.*)/)
    if (match) return match[1]
    return err.message
  }

  if (errorSchema.safeParse(error).success) return (error as Error).message
  return fallback
}
