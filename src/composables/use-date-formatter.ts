export function useDateFormatter() {
  const formatRelativeDate = (date: Date | undefined): string => {
    if (!date) return 'Unknown'
    try {
      return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
        Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
        'day'
      )
    } catch {
      return date.toLocaleDateString()
    }
  }

  return { formatRelativeDate }
}
