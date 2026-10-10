import { Color } from 'three'
import { color } from '../design/tokens'

/** Scene colours, derived from the design tokens. Flat and unlit: no gradients, no glow. */
export const C = {
  ink: new Color(color.ink),
  signal: new Color(color.signal),
  amber: new Color(color.amber),
  text: new Color(color.text),
  node2: new Color('#C3CBD6'),
  node1: new Color('#8A95A5'),
  edge: new Color('#3A4556'),
  edgeHover: new Color('#5E6A7B'),
  edgeDim: new Color('#1B2129'),
  pageFan: new Color('#A6B0BE'),
  pageStrip: new Color('#667283'),
  pageHover: new Color('#6A7585'),
  pageScan: new Color('#DCE3EB'),
  slab: new Color('#B9C2CE'),
}
