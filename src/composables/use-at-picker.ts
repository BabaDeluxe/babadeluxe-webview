import { ref, computed } from 'vue'
import { damerauLevenshteinSimilarity } from '@babadeluxe/shared'

export interface AtPickerItem {
  id: string
  label: string
  type: 'space' | 'prompt' | 'superpower'
  icon?: string
}

const MINIMUM_QUERY_LENGTH_FOR_FUZZY_SEARCH = 2
const MAXIMUM_RESULTS_COUNT = 8
const FUZZY_SEARCH_SIMILARITY_THRESHOLD = 0.3

export function useAtPicker(availableSources: AtPickerItem[]) {
  const isPickerVisible = ref(false)
  const searchQuery = ref('')
  const highlightedItemIndex = ref(0)
  const currentlySelectedSources = ref<AtPickerItem[]>([])

  const filteredResults = computed(() => {
    const normalizedQuery = searchQuery.value.toLowerCase()

    if (normalizedQuery.length < MINIMUM_QUERY_LENGTH_FOR_FUZZY_SEARCH) {
      return getResultsSortedByType(availableSources)
    }

    return getResultsByFuzzyMatching(availableSources, normalizedQuery)
  })

  function getResultsSortedByType(sources: AtPickerItem[]): AtPickerItem[] {
    const typePriorityOrder: Record<AtPickerItem['type'], number> = {
      space: 0,
      prompt: 1,
      superpower: 2,
    }

    return [...sources]
      .sort((first, second) => typePriorityOrder[first.type] - typePriorityOrder[second.type])
      .slice(0, MAXIMUM_RESULTS_COUNT)
  }

  function getResultsByFuzzyMatching(sources: AtPickerItem[], query: string): AtPickerItem[] {
    const matchesWithScores = sources.map((source) => {
      const label = source.label.toLowerCase()
      const similarityScore = damerauLevenshteinSimilarity(query, label)
      const isExactSubstring = label.includes(query)

      return {
        source,
        score: similarityScore,
        isSubstring: isExactSubstring,
      }
    })

    const relevantMatches = matchesWithScores.filter((match) => {
      return match.score > FUZZY_SEARCH_SIMILARITY_THRESHOLD || match.isSubstring
    })

    return relevantMatches
      .sort((first, second) => second.score - first.score)
      .map((match) => match.source)
      .slice(0, MAXIMUM_RESULTS_COUNT)
  }

  const openPicker = (newQuery: string) => {
    searchQuery.value = newQuery
    isPickerVisible.value = true
    highlightedItemIndex.value = 0
  }

  const closePicker = () => {
    isPickerVisible.value = false
    searchQuery.value = ''
  }

  const selectNextItem = () => {
    const resultsCount = filteredResults.value.length
    if (resultsCount === 0) return
    highlightedItemIndex.value = (highlightedItemIndex.value + 1) % resultsCount
  }

  const selectPreviousItem = () => {
    const resultsCount = filteredResults.value.length
    if (resultsCount === 0) return
    highlightedItemIndex.value = (highlightedItemIndex.value - 1 + resultsCount) % resultsCount
  }

  const acceptHighlightedItem = () => {
    const itemToAccept = filteredResults.value[highlightedItemIndex.value]
    if (!itemToAccept) return null

    const isAlreadySelected = currentlySelectedSources.value.some(
      (source) => source.id === itemToAccept.id
    )

    if (isAlreadySelected) {
      closePicker()
      return null
    }

    applyBusinessRulesAndAddSource(itemToAccept)
    closePicker()
    return itemToAccept
  }

  function applyBusinessRulesAndAddSource(item: AtPickerItem) {
    if (item.type === 'space') {
      removeExistingSpaceIfAny()
    }
    currentlySelectedSources.value.push(item)
  }

  function removeExistingSpaceIfAny() {
    currentlySelectedSources.value = currentlySelectedSources.value.filter(
      (source) => source.type !== 'space'
    )
  }

  const removeSourceById = (sourceId: string) => {
    currentlySelectedSources.value = currentlySelectedSources.value.filter(
      (source) => source.id !== sourceId
    )
  }

  return {
    isOpen: isPickerVisible,
    query: searchQuery,
    results: filteredResults,
    activeIndex: highlightedItemIndex,
    activeSources: currentlySelectedSources,
    open: openPicker,
    close: closePicker,
    moveDown: selectNextItem,
    moveUp: selectPreviousItem,
    accept: acceptHighlightedItem,
    removeSource: removeSourceById,
  }
}
