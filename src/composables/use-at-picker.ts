import { ref, computed } from 'vue'

export interface AtPickerItem {
  id: string
  label: string
  type: 'space' | 'prompt' | 'superpower'
  icon?: string
}

function damerauLevenshtein(s1: string, s2: string): number {
  const m = s1.length
  const n = s2.length
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) d[i][0] = i
  for (let j = 0; j <= n; j++) d[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // deletion
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost // substitution
      )
      if (i > 1 && j > 1 && s1[i - 1] === s2[j - 2] && s1[i - 2] === s2[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost) // transposition
      }
    }
  }
  return d[m][n]
}

export function useAtPicker(sources: AtPickerItem[]) {
  const isOpen = ref(false)
  const query = ref('')
  const activeIndex = ref(0)
  const activeSources = ref<AtPickerItem[]>([])

  const results = computed(() => {
    let filtered: AtPickerItem[]
    const q = query.value.toLowerCase()

    if (q.length < 2) {
      const typeOrder = { space: 0, prompt: 1, superpower: 2 }
      filtered = [...sources].sort((a, b) => typeOrder[a.type] - typeOrder[b.type])

    } else {
      filtered = sources
        .map((item) => ({
          item,
          distance: damerauLevenshtein(q, item.label.toLowerCase()),
        }))
        .filter(({ distance, item }) => distance <= 2 || item.label.toLowerCase().includes(q))
        .sort((a, b) => a.distance - b.distance)
        .map(({ item }) => item)
    }

    return filtered.slice(0, 8)
  })

  const open = (q: string) => {
    query.value = q
    isOpen.value = true
    activeIndex.value = 0
  }

  const close = () => {
    isOpen.value = false
    query.value = ''
  }

  const moveDown = () => {
    if (results.value.length === 0) return
    activeIndex.value = (activeIndex.value + 1) % results.value.length
  }

  const moveUp = () => {
    if (results.value.length === 0) return
    activeIndex.value = (activeIndex.value - 1 + results.value.length) % results.value.length
  }

  const accept = () => {
    const item = results.value[activeIndex.value]
    if (!item) return null

    if (activeSources.value.some((s) => s.id === item.id)) {
      close()
      return null
    }

    // Single Space support: replace existing space if new one is added
    if (item.type === 'space') {
      activeSources.value = activeSources.value.filter((s) => s.type !== 'space')
    }

    activeSources.value.push(item)
    close()
    return item
  }

  const removeSource = (id: string) => {
    activeSources.value = activeSources.value.filter((s) => s.id !== id)
  }

  return {
    isOpen,
    query,
    results,
    activeIndex,
    activeSources,
    open,
    close,
    moveDown,
    moveUp,
    accept,
    removeSource,
  }
}
