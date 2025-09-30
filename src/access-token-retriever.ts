/* eslint-disable @typescript-eslint/naming-convention */

import type { SupabaseClient } from '@supabase/supabase-js'

export class AccessTokenRetriever {
  constructor(private readonly supabase: SupabaseClient<any, 'public', 'public', any, any>) {}

  async getAccessToken(): Promise<string | undefined> {
    try {
      // First, try getting the session from Supabase
      const {
        data: { session },
      } = await this.supabase.auth.getSession()
      if (session?.access_token) {
        return session.access_token
      }
    } catch (error) {
      console.warn('Failed to get session from Supabase, falling back to localStorage:', error)
    }
  }
}
