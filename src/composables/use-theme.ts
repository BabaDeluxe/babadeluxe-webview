import { useDark, useToggle } from '@vueuse/core'

// Global state to share across components
const isDark = useDark({
  selector: 'html',
  attribute: 'class',
  valueDark: 'dark',
  valueLight: '',
})

const toggleDark = useToggle(isDark)

export function useTheme() {
  return {
    isDark,
    toggleDark,
  }
}
