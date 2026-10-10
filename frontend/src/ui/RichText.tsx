import { lazy, Suspense, type ReactNode } from 'react'

const Formula = lazy(() => import('./Formula'))

const HAS_MATH = /\$[^$\n]+\$/

/**
 * Plain study text with light extensions: **bold**, *italic*, `inline code` and $inline math$. Math pulls in KaTeX
 * (its own lazy chunk) only when a formula is actually present; until then the source shows as code.
 */
export function RichText({ text }: { text: string }) {
  const out: ReactNode[] = []
  // `code`, $math$, **bold**, *italic*
  const pattern = /(`[^`\n]+`)|(\$[^$\n]+\$)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = pattern.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const token = m[0]
    if (m[1]) out.push(<code key={m.index}>{token.slice(1, -1)}</code>)
    else if (m[3]) out.push(<strong key={m.index}>{token.slice(2, -2)}</strong>)
    else if (m[4]) out.push(<em key={m.index}>{token.slice(1, -1)}</em>)
    else {
      const tex = token.slice(1, -1)
      out.push(
        <Suspense key={m.index} fallback={<code>{tex}</code>}>
          <Formula tex={tex} />
        </Suspense>,
      )
    }
    last = m.index + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}

export const containsMath = (text: string) => HAS_MATH.test(text)

/** Multi-paragraph text: blank lines split paragraphs, ``` fences become code blocks. */
export function RichBlocks({ text }: { text: string }) {
  const blocks = text.split(/```/)
  return (
    <>
      {blocks.map((block, i) =>
        i % 2 === 1 ? (
          <pre key={i}>
            <code>{block.replace(/^\w*\n/, '')}</code>
          </pre>
        ) : (
          block
            .split(/\n{2,}/)
            .map((para) => para.trim())
            .filter(Boolean)
            .map((para, j) => (
              <p key={`${i}-${j}`}>
                <RichText text={para} />
              </p>
            ))
        ),
      )}
    </>
  )
}
