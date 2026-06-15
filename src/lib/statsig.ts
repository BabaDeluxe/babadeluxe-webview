/**
 * Thin adapter so useMessageLimitStore can read Statsig experiments
 * through the existing AnalyticsManager without spawning a second client.
 *
 * Usage:
 *   import { getUpsellCopy, logLimitEvent } from '@/lib/statsig'
 */
import { inject } from 'vue'
import { ANALYTICS_MANAGER_KEY } from '@/injection-keys'
import type { AnalyticsManager } from '@/analytics/analytics-manager'

const EXPERIMENT = 'message_limit_upsell_v1'
const PARAM = 'upsell_copy'

export const VARIANTS: readonly string[] = [
  "You've used all 10 free messages today. Unlock unlimited \u2192",
  'Daily limit reached. Go Pro for unlimited messages.',
  "You're on fire! 10/10 messages used. Keep going with Pro.",
  'Need more? Upgrade and never hit a limit again.',
  "You've hit your daily cap. Pro removes all limits \u2014 forever.",
  '10 messages used today. Pro users never stop.',
  'Your free messages are up. Upgrade and own the conversation.',
  'Daily quota reached. Join Pro for unlimited access.',
  "That's 10 messages. Pro members never pause.",
  'Limit reached. Upgrade to Pro \u2014 it takes 30 seconds.',
] as const

/**
 * Must be called inside a component setup() or composable that has access
 * to the Vue provide/inject context.
 */
export function useStatsigExperiment() {
  const analytics = inject<AnalyticsManager>(ANALYTICS_MANAGER_KEY)

  function getUpsellCopy(): string {
    return analytics?.getExperimentString(EXPERIMENT, PARAM, VARIANTS[0]) ?? VARIANTS[0]
  }

  function logLimitEvent(name: string, variant: string, extra?: Record<string, string>): void {
    analytics?.trackEvent(name, { variant, ...extra })
  }

  return { getUpsellCopy, logLimitEvent }
}
