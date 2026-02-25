import { describe, it, expect, beforeEach, afterEach, vi, test } from 'vitest'
import { useDateFormatter } from '@/composables/use-date-formatter'

describe('useDateFormatter()', () => {
  const { formatRelativeDate } = useDateFormatter()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-07T15:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('formatRelativeDate', () => {
    it('returns "Unknown" for undefined date', () => {
      expect(formatRelativeDate(undefined)).toBe('Unknown')
    })

    const relativeDateCases = [
      {
        name: 'formats tomorrow',
        date: new Date('2026-02-08T15:00:00Z'),
        expected: /^(tomorrow|in 1 day)$/,
      },
      {
        name: 'formats yesterday',
        date: new Date('2026-02-06T15:00:00Z'),
        expected: /^(yesterday|1 day ago)$/,
      },
      {
        name: 'formats 7 days in future',
        date: new Date('2026-02-14T15:00:00Z'),
        expected: /^in 7 days$/,
      },
      {
        name: 'formats 7 days in past',
        date: new Date('2026-01-31T15:00:00Z'),
        expected: /^7 days ago$/,
      },
      {
        name: 'formats 30 days in future',
        date: new Date('2026-03-09T15:00:00Z'),
        expected: /^in 30 days$/,
      },
      {
        name: 'formats same day as today',
        date: new Date('2026-02-07T15:00:00Z'),
        expected: /^(today|in 0 days)$/,
      },
    ]

    test.each(relativeDateCases)('$name', ({ date, expected }) => {
      const result = formatRelativeDate(date)
      expect(result).toMatch(expected)
    })

    it('falls back to locale string when Intl throws', () => {
      const invalidDate = new Date('invalid')

      const result = formatRelativeDate(invalidDate)

      expect(result).toBe('Invalid Date')
    })

    it('handles dates at boundaries (edge of day)', () => {
      vi.setSystemTime(new Date('2026-02-07T23:59:59Z'))
      const almostTomorrow = new Date('2026-02-08T00:00:01Z')

      const result = formatRelativeDate(almostTomorrow)

      expect(result).toMatch(/^(tomorrow|in 1 day)$/)
    })
  })
})
