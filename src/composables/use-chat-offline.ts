import { isOfflineMode } from '@/env-validator'
export const useChatOffline = () => {
  return { isOffline: isOfflineMode() }
}
