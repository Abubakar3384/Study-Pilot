/**
 * Remembers which documents have already played the formation sequence, so returning users see the
 * finished graph immediately. Per-browser convenience only; losing it just replays the animation.
 */
const key = (docId: string) => `sp:formed:${docId}`

export function hasFormed(docId: string): boolean {
  try {
    return localStorage.getItem(key(docId)) === '1'
  } catch {
    return true
  }
}

export function markFormed(docId: string): void {
  try {
    localStorage.setItem(key(docId), '1')
  } catch {
    // storage unavailable: the sequence may replay next time, which is harmless
  }
}
