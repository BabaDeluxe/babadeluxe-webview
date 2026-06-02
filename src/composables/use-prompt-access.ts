import { useSubscriptionSocket } from '@/composables/use-subscription-socket'

/**
 * Single source of truth for prompt tier access control.
 *
 * Consume this composable in any component or composable that needs to:
 * - Decide whether to allow prompt execution (canUsePrompt)
 * - Decide whether to render a lock icon / upsell CTA (isPromptLocked)
 *
 * Both the @-mention picker and the SettingsView prompts list should use
 * isPromptLocked(). use-prompts-socket.ts should guard execution via
 * canUsePrompt() before emitting any socket event.
 *
 * Backend enforcement is handled separately in babadeluxe-backend
 * (prompt-template-actions-impl.ts) and should never be removed —
 * frontend access control alone is not sufficient.
 */
export function usePromptAccess() {
  const { isPro } = useSubscriptionSocket()

  /**
   * Returns true if the current user is allowed to execute the given prompt.
   * Free users may only use non-premium prompts.
   */
  const canUsePrompt = (isPremium: boolean): boolean => !isPremium || isPro.value

  /**
   * Returns true if the prompt should be rendered as locked in the UI.
   * Use this for the lock icon and disabled state in pickers / settings.
   */
  const isPromptLocked = (isPremium: boolean): boolean => isPremium && !isPro.value

  return { canUsePrompt, isPromptLocked }
}
