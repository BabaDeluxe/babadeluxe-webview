import { computed } from 'vue'
import { getVsCodeApi } from '@/vs-code/api'

export function useIsInVsCode() {
  const isInVsCode = computed(() => getVsCodeApi().isOk())
  return { isInVsCode }
}
