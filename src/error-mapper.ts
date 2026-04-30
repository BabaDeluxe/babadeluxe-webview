import { BaseError, NetworkError, RateLimitError, AuthError } from '@/errors'

export function toUserMessage(error: unknown, fallback = 'An unexpected error occurred.'): string {
  if (typeof error === 'string') return error
  if (error instanceof RateLimitError) return 'Rate limit exceeded. Please slow down.'
  if (error instanceof NetworkError)
    return 'Unable to connect to the server. Please check your connection.'
  if (error instanceof AuthError) {
    if (error.message.includes('confirm your email') || error.message.includes('Confirm your email')) {
        return error.message
    }
    return 'Your session has expired or is invalid. Please sign in again.'
  }

  // Strip [Namespace] prefix from BaseErrors if present
  if (error instanceof BaseError) {
    const match = error.message.match(/^\[.*?\]\s(.*)/)
    if (match) return match[1]
    return error.message
  }

  if (error instanceof Error) return error.message
  return fallback
}
