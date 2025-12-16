import { ref } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { type Result } from 'neverthrow'
import { type SearchService } from '@/search-service'
import type { SearchResult } from '@/search-types'
import type { SearchError } from '@/errors'

export function useSearch(searchService: SearchService) {
  const searchResults = ref<SearchResult[]>([])
  const isSearching = ref(false)
  const searchError = ref<string | undefined>(undefined)

  const performSearch = useDebounceFn(async (query: string) => {
    if (!query.trim()) {
      searchResults.value = []
      searchError.value = undefined
      return
    }

    isSearching.value = true
    searchError.value = undefined

    const result: Result<SearchResult[], SearchError> = await searchService.search(query, 10)

    result.match(
      (results) => {
        searchResults.value = results
        searchError.value = undefined
      },
      (error: SearchError) => {
        searchResults.value = []
        searchError.value = error.message
      }
    )

    isSearching.value = false
  }, 300)

  return {
    searchResults,
    isSearching,
    searchError,
    performSearch,
  }
}
