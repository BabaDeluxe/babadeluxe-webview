import { ref } from 'vue'
import { safeInject } from '@/safe-inject'
import { SUPABASE_CLIENT_KEY } from '@/injection-keys'

export function useConversationListState() {
  const supabase = safeInject(SUPABASE_CLIENT_KEY)
  const conversations = ref([])

  return {
    conversations,
    supabase,
  }
}
