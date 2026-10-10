import { FileUp } from 'lucide-react'
import { MAX_UPLOAD_MB } from '../../api/upload'
import { Button } from '../../ui/Button'
import { useUpload } from '../upload/uploadStore'

/**
 * First visit: explain the product in one line and offer the upload. Deliberately a static SVG,
 * not the 3D scene, so nothing heavy loads before there's anything to show.
 */
export function EmptyHero() {
  const pickFile = useUpload((s) => s.pickFile)
  const rejection = useUpload((s) => s.rejection)
  return (
    <section className="grid items-center gap-10 rounded-md border border-line bg-surface-1 px-6 py-10 md:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:py-16">
      <div className="max-w-[46ch]">
        <p className="eyebrow">Start here</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-text">Turn a course PDF into a map you can study from.</h1>
        <p className="mt-4 text-md text-text-2">
          StudyPilot reads your lecture notes or textbook chapter, maps its key concepts and how they connect, then
          builds notes, quizzes and flashcards that cite the exact pages.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button variant="primary" size="lg" icon={<FileUp className="size-4" />} onClick={pickFile}>
            Upload a PDF
          </Button>
          <span className="text-sm text-text-3">or drop it anywhere on this page</span>
        </div>
        <p className="mt-4 font-mono text-xs text-text-3">
          PDF up to {MAX_UPLOAD_MB} MB · text-based (scanned pages aren’t supported yet)
        </p>
        {rejection && (
          <p role="alert" className="mt-3 text-base text-incorrect">
            {rejection}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={pickFile}
        aria-label="Upload a PDF"
        className="group relative mx-auto aspect-[4/3] w-full max-w-[520px] rounded-md border border-dashed border-line-strong transition-colors hover:border-signal"
      >
        <HeroIllustration />
      </button>
    </section>
  )
}

/** A stack of pages resolving into a few connected concepts: the product in one picture. */
function HeroIllustration() {
  return (
    <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full" aria-hidden>
      {[0, 1, 2].map((i) => (
        <g
          key={i}
          transform={`translate(${118 + i * 14} ${58 + i * 10})`}
          className="transition-transform duration-300 ease-[var(--ease-enter)] group-hover:-translate-y-1"
        >
          <rect width="120" height="156" rx="3" className="fill-surface-2 stroke-line-strong" />
          <rect x="14" y="18" width="56" height="6" className="fill-line-strong" />
          {[0, 1, 2, 3, 4, 5, 6].map((l) => (
            <rect key={l} x="14" y={38 + l * 14} width={l % 3 === 2 ? 52 : 90} height="3" className="fill-line" />
          ))}
        </g>
      ))}
      <g className="stroke-line-strong" strokeWidth="1.25">
        <line x1="300" y1="92" x2="338" y2="150" />
        <line x1="338" y1="150" x2="298" y2="206" />
        <line x1="300" y1="92" x2="298" y2="206" />
      </g>
      <circle cx="300" cy="92" r="9" className="fill-amber" />
      <circle cx="338" cy="150" r="6" className="fill-[#C3CBD6]" />
      <circle cx="298" cy="206" r="7" className="fill-signal" />
    </svg>
  )
}
