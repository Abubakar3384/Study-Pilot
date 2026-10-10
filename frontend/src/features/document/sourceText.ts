/** PDF text has hard line breaks at every visual line; keep paragraph breaks, join the rest. */
export function reflow(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/-\n(?=[a-z])/g, '')
    .replace(/([^\n])\n(?!\n)/g, '$1 ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/** Finds the cited snippet in the page text, tolerant of whitespace differences. */
export function splitOnSnippet(text: string, snippet: string | null): Array<{ text: string; hit: boolean }> {
  if (!snippet) return [{ text, hit: false }]
  const needle = snippet.replace(/[….]+$/, '').trim().slice(0, 120)
  if (needle.length < 8) return [{ text, hit: false }]
  const pattern = needle
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+')
  const match = new RegExp(pattern, 'i').exec(text)
  if (!match) return [{ text, hit: false }]
  return [
    { text: text.slice(0, match.index), hit: false },
    { text: match[0], hit: true },
    { text: text.slice(match.index + match[0].length), hit: false },
  ]
}
