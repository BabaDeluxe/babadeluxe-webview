import { StatsigClient } from '@statsig/js-client'

let client: StatsigClient | null = null

export async function initStatsig(userId: string): Promise<void> {
  const sdkKey = import.meta.env.VITE_STATSIG_CLIENT_KEY
  if (!sdkKey) return

  client = new StatsigClient(sdkKey, { userID: userId })
  await client.initializeAsync()
}

export function getUpsellCopy(): string {
  if (!client) return VARIANTS[0]
  const exp = client.getExperiment('message_limit_upsell_v1')
  return exp.get('upsell_copy', VARIANTS[0])
}

export function logEvent(name: string, metadata?: Record<string, string>): void {
  client?.logEvent(name, undefined, metadata)
}

// Fallback variants — source of truth lives in Statsig dashboard
export const VARIANTS: string[] = [
  "You've used all 10 free messages today. Unlock unlimited →",
  'Daily limit reached. Go Pro for unlimited messages.',
  "You're on fire! 10/10 messages used. Keep going with Pro.",
  'Need more? Upgrade and never hit a limit again.',
  "You've hit your daily cap. Pro removes all limits — forever.",
  '10 messages used today. Pro users never stop.',
  'Your free messages are up. Upgrade and own the conversation.',
  'Daily quota reached. Join Pro for unlimited access.',
  "That's 10 messages. Pro members never pause.",
  'Limit reached. Upgrade to Pro — it takes 30 seconds.',
]
