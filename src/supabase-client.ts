import { createClient } from '@supabase/supabase-js'

export const initSupabase = () => {
  return createClient(
    'https://vspnxnpyzqskaiphkapr.supabase.co',
    'sb_publishable_KGxdYNkLclfDXSD0mSL_tA_ZlXByhrb'
  )
}
