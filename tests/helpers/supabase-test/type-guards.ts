import type { AdminUser, ErrorResponse, RecoveryLinkResponse } from './types'

export function isErrorResponse(data: unknown): data is ErrorResponse {
  return typeof data === 'object' && data !== null && ('error' in data || 'message' in data)
}

export function isAdminUser(data: unknown): data is AdminUser {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    typeof (data as { id: unknown }).id === 'string'
  )
}

export function isRecoveryLinkResponse(data: unknown): data is RecoveryLinkResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'action_link' in data &&
    // eslint-disable-next-line @typescript-eslint/naming-convention
    typeof (data as { action_link: unknown }).action_link === 'string'
  )
}
