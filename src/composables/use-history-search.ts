import { ref, computed } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { useSearch } from '@/composables/use-search'
import type { SearchService } from '@/search-service'
import { type SearchResult, isMessageResult, isConversationResult } from '@/search-types'
import type { Conversation } from '@/database/types'

export function useHistorySearch(
  searchService: SearchService,
  conversations: { value: Conversation[] },
  navigateToMessage: (mid: number, cid: number) => Promise<void>,
  switchToConversation: (cid: number) => Promise<void>
) {
  const { searchResults, isSearching, performSearch } = useSearch(searchService)

  const searchQuery = ref('')
  const highlightedIndex = ref(-1)
  const dropdownRef = ref<HTMLElement>()

  onClickOutside(dropdownRef, () => {
    if (searchQuery.value) {
      searchQuery.value = ''
      highlightedIndex.value = -1
    }
  })

  const filteredConversations = computed(() => {
    if (!searchQuery.value.trim()) {
      return conversations.value
    }

    return conversations.value.filter((conv) =>
      conv.title.toLowerCase().includes(searchQuery.value.toLowerCase())
    )
  })

  const handleSearch = () => {
    performSearch(searchQuery.value)
  }

  const clearSearch = () => {
    searchQuery.value = ''
    highlightedIndex.value = -1
  }

  const highlightNext = () => {
    if (searchResults.value.length === 0) return
    highlightedIndex.value = (highlightedIndex.value + 1) % searchResults.value.length
  }

  const highlightPrevious = () => {
    if (searchResults.value.length === 0) return
    highlightedIndex.value =
      highlightedIndex.value <= 0 ? searchResults.value.length - 1 : highlightedIndex.value - 1
  }

  const selectHighlighted = () => {
    if (highlightedIndex.value >= 0 && searchResults.value[highlightedIndex.value]) {
      handleSearchResultClick(searchResults.value[highlightedIndex.value])
    }
  }

  const handleResultHover = (index: number) => {
    highlightedIndex.value = index
  }

  const handleSearchResultClick = async (result: SearchResult) => {
    if (isMessageResult(result)) {
      const mid = Number(result.id)
      const cid = Number(result.conversationId)
      await navigateToMessage(mid, cid)
    } else if (isConversationResult(result)) {
      const cid = Number(result.id)
      await switchToConversation(cid)
    }

    searchQuery.value = ''
  }

  const getSearchResultSubtitle = (result: SearchResult) => {
    if (isConversationResult(result)) return 'Conversation'
    if (isMessageResult(result)) {
      const found = conversations.value.find((c) => c.id === result.conversationId)
      const title = found?.title || 'Unknown'
      return `Message in "${title}"`
    }

    return 'Result'
  }

  const getSearchResultMainText = (result: SearchResult) => {
    if (isConversationResult(result)) return result.title
    if (isMessageResult(result)) {
      const text = result.content
      return text.length <= 150 ? text : `${text.slice(0, 150)}...`
    }
    return ''
  }

  return {
    searchQuery,
    searchResults,
    isSearching,
    highlightedIndex,
    dropdownRef,
    filteredConversations,
    handleSearch,
    clearSearch,
    highlightNext,
    highlightPrevious,
    selectHighlighted,
    handleResultHover,
    handleSearchResultClick,
    getSearchResultSubtitle,
    getSearchResultMainText,
  }
}
