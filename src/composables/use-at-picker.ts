import { ref, computed } from 'vue'
import { damerauLevenshteinSimilarity } from '@babadeluxe/shared'

export interface AtPickerItem {
  id: string
  label: string
  type: 'space' | 'prompt' | 'superpower'
  icon?: string
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
          score: damerauLevenshteinSimilarity(q, item.label.toLowerCase()),
        }))
        .filter(({ score, item }) => score > 0.3 || item.label.toLowerCase().includes(q))
        .sort((a, b) => b.score - a.score)
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
