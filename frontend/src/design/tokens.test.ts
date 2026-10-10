import { readFileSync } from 'node:fs'
import { color } from './tokens'
import { contrastRatio } from './contrast'

const surfaces = { ink: color.ink, surface1: color.surface1, surface2: color.surface2 }

describe('color tokens', () => {
  it.each(['text', 'text2', 'text3', 'signal', 'amber', 'correct', 'incorrect'] as const)(
    '%s meets WCAG AA (4.5:1) on every surface',
    (fg) => {
      for (const [name, bg] of Object.entries(surfaces)) {
        expect(contrastRatio(color[fg], bg), `${fg} on ${name}`).toBeGreaterThanOrEqual(4.5)
      }
    },
  )

  it('text on signal fill (primary button) meets AA', () => {
    expect(contrastRatio(color.ink, color.signal)).toBeGreaterThanOrEqual(4.5)
  })

  it('stay in sync with the CSS @theme block', () => {
    const css = readFileSync('src/styles/index.css', 'utf8').toLowerCase()
    const cssName = (k: string) => k.replace(/([A-Z])/g, '-$1').replace(/(\d)/, '-$1').toLowerCase()
    for (const [key, hex] of Object.entries(color)) {
      expect(css, key).toContain(`--color-${cssName(key)}: ${hex.toLowerCase()};`)
    }
  })
})
