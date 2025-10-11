import { describe, it, expect } from 'vitest'
import { damerauLevenshteinSimilarity } from '@/damerau-levenshtein-similarity'

describe('damerauLevenshteinSimilarity', () => {
  it('should return 1 for identical strings', () => {
    expect(damerauLevenshteinSimilarity('test', 'test')).toBe(1)
    expect(damerauLevenshteinSimilarity('hello', 'hello')).toBe(1)
  })

  it('should return 1 for two empty strings', () => {
    expect(damerauLevenshteinSimilarity('', '')).toBe(1)
  })

  it('should handle single character difference', () => {
    const result = damerauLevenshteinSimilarity('cat', 'bat')
    expect(result).toBeCloseTo(0.6667, 4)
  })

  it('should handle transposition', () => {
    const result = damerauLevenshteinSimilarity('smith', 'smtih')
    expect(result).toBeCloseTo(0.8, 4)
  })

  it('should handle insertions', () => {
    const result = damerauLevenshteinSimilarity('cat', 'cats')
    expect(result).toBeCloseTo(0.75, 4)
  })

  it('should handle deletions', () => {
    const result = damerauLevenshteinSimilarity('cats', 'cat')
    expect(result).toBeCloseTo(0.75, 4)
  })

  it('should handle multiple operations', () => {
    const result = damerauLevenshteinSimilarity('kitten', 'sitting')
    expect(result).toBeCloseTo(0.5714, 4)
  })

  it('should return positive scores between 0 and 1', () => {
    const result = damerauLevenshteinSimilarity('bison', 'test')
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThanOrEqual(1)
  })

  it('should handle completely different strings', () => {
    const result = damerauLevenshteinSimilarity('abc', 'xyz')
    expect(result).toBeCloseTo(0, 4)
  })

  it('should be case-sensitive', () => {
    const result = damerauLevenshteinSimilarity('Test', 'test')
    expect(result).toBeCloseTo(0.75, 4)
  })

  it('should handle strings of different lengths', () => {
    const result = damerauLevenshteinSimilarity('ca', 'abc')
    expect(result).toBeCloseTo(0.6667, 4)
  })

  it('should handle one empty string', () => {
    const result = damerauLevenshteinSimilarity('', 'test')
    expect(result).toBe(0)
  })

  it('should be symmetric', () => {
    const resultAB = damerauLevenshteinSimilarity('hello', 'hallo')
    const resultBA = damerauLevenshteinSimilarity('hallo', 'hello')
    expect(resultAB).toBe(resultBA)
  })
})
