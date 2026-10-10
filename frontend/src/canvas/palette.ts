import { Color } from 'three'
import { color } from '../design/tokens'

export type SceneTheme = 'light' | 'dark'

/**
 * Scene colours for each theme. Light uses the dashboard's pastel family: gold key concepts,
 * lavender and blue supporting nodes, soft blue-grey links and the teal selection colour.
 */
const PALETTES = {
  dark: {
    ink: color.ink,
    fog: '#0b0f17',
    signal: color.signal,
    amber: color.amber,
    text: color.text,
    node2: '#C3CBD6',
    node1: '#8A95A5',
    edge: '#3A4556',
    edgeHover: '#5E6A7B',
    edgeDim: '#1B2129',
    pageFan: '#A6B0BE',
    pageStrip: '#667283',
    pageHover: '#6A7585',
    pageScan: '#DCE3EB',
    slab: '#B9C2CE',
  },
  light: {
    ink: '#F3F6FB',
    fog: '#F3F6FB',
    signal: '#0891B2',
    amber: '#E9A93A',
    text: '#5D6B85',
    node2: '#8E86E0',
    node1: '#7FA6D6',
    edge: '#C3CDDD',
    edgeHover: '#8B9BB4',
    edgeDim: '#E6EBF3',
    pageFan: '#FFFFFF',
    pageStrip: '#EEF2F8',
    pageHover: '#DCEAF8',
    pageScan: '#CFE3F7',
    slab: '#FFFFFF',
  },
} as const

type Key = keyof (typeof PALETTES)['dark']

/** Live colour objects. They are updated in place on theme change, so every component's eased
 *  colour targets move to the new palette without rebuilding anything. */
export const C = Object.fromEntries(Object.entries(PALETTES.dark).map(([k, v]) => [k, new Color(v)])) as Record<Key, Color>

let current: SceneTheme = 'dark'

export function applyPalette(theme: SceneTheme) {
  current = theme
  for (const [k, v] of Object.entries(PALETTES[theme])) C[k as Key].set(v)
}

export const paletteTheme = () => current

applyPalette(typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
