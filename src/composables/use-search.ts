import { ref } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { type Result } from 'neverthrow'
import { type SearchService } from '@/search-service'
import type { SearchResult } from '@/search-types'
import type { NetworkError } from '@/errors'

export function useSearch(searchService: SearchService) {
  const searchResults = ref<SearchResult[]>([])
  const isSearching = ref(false)
  const networkError = ref<string | undefined>(undefined)

  const performSearch = useDebounceFn(async (query: string) => {
    if (!query.trim()) {
      searchResults.value = []
      networkError.value = undefined
      return
    }

    isSearching.value = true
    networkError.value = undefined

    const result: Result<SearchResult[], NetworkError> = await searchService.search(query, 10)

    result.match(
      (results) => {
        searchResults.value = results
        networkError.value = undefined
      },
      (error: NetworkError) => {
        searchResults.value = []
        networkError.value = error.message
      }
    )

    isSearching.value = false
  }, 300)

  return {
    searchResults,
    isSearching,
    networkError,
    performSearch,
  }
}
