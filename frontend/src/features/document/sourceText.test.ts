import { reflow, splitOnSnippet } from './sourceText'

describe('source text helpers', () => {
  it('reflows hard-wrapped PDF lines but keeps paragraphs and joins hyphenation', () => {
    expect(reflow('The cell is the basic\nunit of life.\n\nMito-\nchondria make ATP.')).toBe(
      'The cell is the basic unit of life.\n\nMitochondria make ATP.',
    )
  })

  it('highlights a cited snippet even when whitespace differs', () => {
    const parts = splitOnSnippet('Intro. Mitochondria carry out   aerobic respiration. End.', 'Mitochondria carry out aerobic respiration…')
    expect(parts.map((p) => p.hit)).toEqual([false, true, false])
    expect(parts[1]!.text).toMatch(/^Mitochondria carry out\s+aerobic respiration$/)
  })

  it('leaves text alone when the snippet is missing or too short', () => {
    expect(splitOnSnippet('abc', null)).toEqual([{ text: 'abc', hit: false }])
    expect(splitOnSnippet('abc def', 'abc')).toHaveLength(1)
  })
})
