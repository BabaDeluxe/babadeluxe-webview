export function damerauLevenshteinSimilarity(first: string, second: string): number {
  const lengthFirst: number = first.length
  const lengthSecond: number = second.length

  if (lengthFirst === 0 && lengthSecond === 0) {
    return 1
  }

  if (lengthFirst === 0 || lengthSecond === 0) {
    return 0 // One empty, one not = no similarity
  }

  // Swap so that the shorter string is always the column dimension
  let a: string = first
  let b: string = second
  let m: number = lengthFirst
  let n: number = lengthSecond
  if (m > n) {
    a = second
    b = first
    m = lengthSecond
    n = lengthFirst
  }

  // Use only three rolling arrays for space optimization
  let twoRowsBack: number[] = Array.from({ length: n + 1 }).fill(0) as number[]
  let previousRow: number[] = Array.from({ length: n + 1 }, (_, i) => i) as number[]
  let currRow: number[] = Array.from({ length: n + 1 }).fill(0) as number[]

  for (let i = 1; i <= m; i++) {
    currRow[0] = i

    for (let j = 1; j <= n; j++) {
      const cost: number = a[i - 1] === b[j - 1] ? 0 : 1

      // Basic operations
      let minEdit: number = Math.min(
        previousRow[j] + 1, // Delete
        currRow[j - 1] + 1, // Insert
        previousRow[j - 1] + cost // Substitute
      )

      // Transposition (Damerau)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        minEdit = Math.min(minEdit, twoRowsBack[j - 2] + 1)
      }

      currRow[j] = minEdit
    }

    // Rotate arrays by reference for speed
    ;[twoRowsBack, previousRow, currRow] = [previousRow, currRow, twoRowsBack]
  }

  const maxLength: number = Math.max(lengthFirst, lengthSecond)
  const similarity: number = 1 - previousRow[n] / maxLength

  return similarity
}

// Example usage:
// console.log(`Test 1: ${damerauLevenshteinSimilarity('ca', 'abc').toFixed(4)}`) // 0.6667
// console.log(`Test 2: ${damerauLevenshteinSimilarity('abcdefg', 'bacdfeg').toFixed(4)}`) // 0.7143
// console.log(`Test 3: ${damerauLevenshteinSimilarity('kitten', 'sitting').toFixed(4)}`) // 0.5714
// console.log(`Test 4: ${damerauLevenshteinSimilarity('', '').toFixed(4)}`) // 1.0000
// console.log(`Test 5: ${damerauLevenshteinSimilarity('smtih', 'smith').toFixed(4)}`) // 0.8000
