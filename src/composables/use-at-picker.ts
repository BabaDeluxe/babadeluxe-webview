import { ref, computed, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { damerauLevenshteinSimilarity } from '@babadeluxe/shared'

export interface AtPickerItem {
  id: string
  label: string
  type: 'space' | 'prompt' | 'superpower'
  icon?: string
  isDisabled?: boolean
  disabledReason?: string
}

const minimumQueryLengthForFuzzySearch = 2
const maximumResultsCount = 8
const fuzzySearchSimilarityThreshold = 0.3

export function useAtPicker(availableSources: MaybeRefOrGetter<AtPickerItem[]>) {
  const isPickerVisible = ref(false)
  const searchQuery = ref('')
  const highlightedItemIndex = ref(0)
  const currentlySelectedSources = ref<AtPickerItem[]>([])

  const filteredResults = computed(() => {
    const sources = toValue(availableSources)
    const normalizedQuery = searchQuery.value.toLowerCase()

    if (normalizedQuery.length < minimumQueryLengthForFuzzySearch) {
      return getResultsSortedByType(sources)
    }

    return getResultsByFuzzyMatching(sources, normalizedQuery)
  })

  const enabledResults = computed(() => filteredResults.value.filter((item) => !item.isDisabled))

  function getResultsSortedByType(sources: AtPickerItem[]): AtPickerItem[] {
    const typePriorityOrder: Record<AtPickerItem['type'], number> = {
      space: 0,
      prompt: 1,
      superpower: 2,
    }

    return [...sources]
      .sort((first, second) => typePriorityOrder[first.type] - typePriorityOrder[second.type])
      .slice(0, maximumResultsCount)
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
      return match.score > fuzzySearchSimilarityThreshold || match.isSubstring
    })

    return relevantMatches
      .sort((first, second) => second.score - first.score)
      .map((match) => match.source)
      .slice(0, maximumResultsCount)
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
    const items = enabledResults.value
    if (items.length === 0) return
    const currentEnabledIndex = items.findIndex(
      (item) => item === filteredResults.value[highlightedItemIndex.value]
    )
    const nextEnabledIndex = (currentEnabledIndex + 1) % items.length
    highlightedItemIndex.value = filteredResults.value.indexOf(items[nextEnabledIndex])
  }

  const selectPreviousItem = () => {
    const items = enabledResults.value
    if (items.length === 0) return
    const currentEnabledIndex = items.findIndex(
      (item) => item === filteredResults.value[highlightedItemIndex.value]
    )
    const prevEnabledIndex = (currentEnabledIndex - 1 + items.length) % items.length
    highlightedItemIndex.value = filteredResults.value.indexOf(items[prevEnabledIndex])
  }

  const acceptHighlightedItem = () => {
    const itemToAccept = filteredResults.value[highlightedItemIndex.value]
    if (!itemToAccept || itemToAccept.isDisabled) {
      closePicker()
      return null
    }

    const isAlreadySelected = currentlySelectedSources.value.some(
      (source) => source.id === itemToAccept.id
    )

    if (isAlreadySelected) {
      closePicker()
      return itemToAccept
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
