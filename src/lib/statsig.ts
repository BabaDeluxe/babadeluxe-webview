import { StatsigClient } from '@statsig/js-client'

const UPSELL_VARIANTS: Record<string, string> = {
  A: 'You\'ve used all 10 free messages today. Unlock unlimited →',
  B: 'Daily limit reached. Go Pro for unlimited messages.',
  C: 'You\'re on fire! 10/10 messages used. Keep going with Pro.',
  D: 'Need more? Upgrade and never hit a limit again.',
  E: 'You\'ve hit your daily cap. Pro removes all limits — forever.',
  F: '10 messages used today. Pro users never stop.',
  G: 'Your free messages are up. Upgrade and own the conversation.',
  H: 'Daily quota reached. Join Pro for unlimited access.',
  I: 'That\'s 10 messages. Pro members never pause.',
  J: 'Limit reached. Upgrade to Pro — it takes 30 seconds.',
}

let _client: StatsigClient | null = null

export async function initStatsig(userID: string): Promise<void> {
  const key = import.meta.env.VITE_STATSIG_CLIENT_KEY as string
  if (!key) {
    console.warn('[statsig] VITE_STATSIG_CLIENT_KEY not set — running without Statsig')
    return
  }
  _client = new StatsigClient(key, { userID })
  await _client.initializeAsync()
}

export function getUpsellCopy(): string {
  if (!_client) return UPSELL_VARIANTS.A
  const experiment = _client.getExperiment('message_limit_upsell_v1')
  return experiment.get<string>('upsell_copy', UPSELL_VARIANTS.A)
}

export function logStatsigEvent(
  name: string,
  metadata?: Record<string, string>,
): void {
  _client?.logEvent(name, undefined, metadata)
}
