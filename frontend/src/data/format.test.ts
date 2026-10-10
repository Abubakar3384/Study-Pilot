import { documentTitle } from './format'

describe('documentTitle', () => {
  it.each([
    ['cell-biology.pdf', 'Cell biology'],
    ['week-03_cell_biology.PDF', 'Week 03 cell biology'],
    ['Na-K pump - lecture 2.pdf', 'Na-K pump – lecture 2'],
    ['Lecture notes.pdf', 'Lecture notes'],
    ['.pdf', '.pdf'],
  ])('%s → %s', (filename, title) => {
    expect(documentTitle({ filename })).toBe(title)
  })
})
