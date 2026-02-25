<template>
  <div
    ref="dropdownRef"
    aria-label="Search results dropdown"
    class="absolute top-14 left-3 right-4 bg-panel border border-borderMuted rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto"
  >
    <div
      v-if="isLoading"
      class="flex justify-center p-4"
    >
      <BaseSpinner size="small" />
    </div>

    <div
      v-else
      class="flex flex-col"
    >
      <div
        v-if="results.length === 0"
        class="p-3 text-subtleText text-center"
      >
        No matches found
      </div>
      <div v-else>
        <div
          class="px-3 py-2 text-xs text-subtleText border-b border-borderMuted"
          aria-label="Search result count"
        >
          {{ results.length }} {{ results.length === 1 ? 'result' : 'results' }}
        </div>
        <div
          v-for="(result, index) in results"
          :key="getResultKey(result, index)"
          :data-result-type="result.resultType"
          :class="[
            'p-3 cursor-pointer border-b border-borderMuted last:border-b-0 transition-colors',
            index === highlightedIndex ? 'bg-accent/20' : 'hover:bg-slate',
          ]"
          @click="handleResultClick(result)"
          @mouseenter="handleResultHover(index)"
        >
          <slot
            name="result"
            :result="result"
            :index="index"
          >
            <div class="flex items-start gap-2">
              <i
                :class="getResultIcon(result)"
                class="text-accent mt-1 flex-shrink-0"
              />
              <div class="flex-1 min-w-0">
                <div class="text-xs text-subtleText mb-1">
                  {{ getResultSubtitle(result) }}
                </div>
                <div class="text-sm text-deepText font-medium mb-1 truncate">
                  {{ getResultMainText(result) }}
                </div>
                <div
                  v-if="showScore && result.score !== undefined"
                  class="text-xs text-accent"
                >
                  Match: {{ (result.score * 100).toFixed(0) }}%
                </div>
              </div>
            </div>
          </slot>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts" generic="T extends SearchResult">
import { ref } from 'vue'
import BaseSpinner from './BaseSpinner.vue'
import type { SearchResult } from '@/search-types'

interface SearchResultsDropdownProps<T extends SearchResult> {
  results: T[]
  isLoading?: boolean
  highlightedIndex?: number
  showScore?: boolean
  getResultKey?: (result: T, index: number) => string | number
  getResultIcon?: (result: T) => string
  getResultSubtitle?: (result: T) => string
  getResultMainText?: (result: T) => string
}

interface SearchResultsDropdownEmits<T extends SearchResult> {
  (event: 'result-click', result: T): void
  (event: 'result-hover', index: number): void
}

withDefaults(defineProps<SearchResultsDropdownProps<T>>(), {
  isLoading: false,
  highlightedIndex: -1,
  showScore: true,
  getResultKey: (result: T, index: number) => `${result.resultType}-${result.id ?? index}`,
  getResultIcon: (result: T) =>
    result.resultType === 'conversation' ? 'i-bi:chat-left' : 'i-bi:chat-text',
  getResultSubtitle: () => '',
  getResultMainText: () => '',
})

const emit = defineEmits<SearchResultsDropdownEmits<T>>()

const dropdownRef = ref<HTMLElement>()

const handleResultClick = (result: T) => {
  emit('result-click', result)
}

const handleResultHover = (index: number) => {
  emit('result-hover', index)
}

defineExpose({
  dropdownRef,
})
</script>
