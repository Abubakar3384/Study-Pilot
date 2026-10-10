import type { DocumentDto } from '../api/types'

/**
 * Readable title from a filename. Slug-style names ("week-03_cell-biology.pdf") use - and _ as spaces;
 * names that already contain spaces keep their hyphens ("Na-K pump - lecture 2.pdf").
 */
export function documentTitle(doc: Pick<DocumentDto, 'filename'>): string {
  let base = doc.filename.replace(/\.pdf$/i, '').trim()
  base = /\s/.test(base) ? base.replace(/_+/g, ' ').replace(/\s+-\s+/g, ' – ') : base.replace(/[_-]+/g, ' ')
  base = base.replace(/\s+/g, ' ').trim()
  return base ? base[0]!.toUpperCase() + base.slice(1) : doc.filename
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3600],
  ['minute', 60],
]

export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = (new Date(iso).getTime() - now) / 1000
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
