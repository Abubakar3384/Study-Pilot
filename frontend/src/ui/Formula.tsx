import katex from 'katex'
import 'katex/dist/katex.min.css'

/** KaTeX rendering, in its own chunk. Invalid TeX falls back to showing the source. */
export default function Formula({ tex }: { tex: string }) {
  let html: string
  try {
    html = katex.renderToString(tex, { throwOnError: true, output: 'htmlAndMathml' })
  } catch {
    return <code>{tex}</code>
  }
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}
