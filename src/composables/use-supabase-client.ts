import { inject } from 'vue'
import type { SupabaseClient } from '@supabase/supabase-js'
import { IocEnum } from '@/enums/ioc-enum'

export function useSupabaseClient(): SupabaseClient {
  const client = inject<SupabaseClient>(IocEnum.SUPABASE_CLIENT)!
  return client
}
