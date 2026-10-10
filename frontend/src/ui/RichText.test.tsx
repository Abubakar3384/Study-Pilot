import { render } from '@testing-library/react'
import { RichText } from './RichText'

describe('RichText', () => {
  it('renders **bold**, *italic* and `code` inline, leaving other text alone', () => {
    const { container } = render(<RichText text="A **key term**, some *emphasis*, and `x = 1` at 3 * 4 = 12." />)
    expect(container.querySelector('strong')?.textContent).toBe('key term')
    expect(container.querySelector('em')?.textContent).toBe('emphasis')
    expect(container.querySelector('code')?.textContent).toBe('x = 1')
    expect(container.textContent).toBe('A key term, some emphasis, and x = 1 at 3 * 4 = 12.')
  })
})
