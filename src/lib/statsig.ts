import {StatsigClient, type StatsigUser} from '@statsig/js-client'

let _client: StatsigClient | null = null

export async function initStatsig(user: StatsigUser): Promise<void> {
  _client = new StatsigClient(
    import.meta.env.VITE_STATSIG_CLIENT_KEY as string,
    user,
  )
  await _client.initializeAsync()
}

export function getUpsellVariant(): string {
  if (!_client) return 'Upgrade to Pro for unlimited messages.'
  return _client
    .getExperiment('message_limit_upsell_v1')
    .get('upsell_copy', 'Upgrade to Pro for unlimited messages.')
}

export function logStatsigEvent(
  name: string,
  metadata?: Record<string, string>,
): void {
  _client?.logEvent(name, undefined, metadata)
}
