/** "p. 4", "pp. 4–5", "pp. 4, 9, 12" — compact page references. */
export function formatPages(pages: number[]): string {
  if (pages.length === 0) return ''
  if (pages.length === 1) return `p. ${pages[0]}`
  const sorted = [...new Set(pages)].sort((a, b) => a - b)
  const contiguous = sorted.every((p, i) => i === 0 || p === sorted[i - 1]! + 1)
  if (contiguous) return `pp. ${sorted[0]}–${sorted.at(-1)}`
  if (sorted.length > 3) return `pp. ${sorted.slice(0, 3).join(', ')}…`
  return `pp. ${sorted.join(', ')}`
}
