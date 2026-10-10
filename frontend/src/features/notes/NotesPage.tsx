import { useEffect, useMemo, useRef, useState } from 'react'
import { useAiJob } from '../../data/generation'
import { BusyNote, StopButton } from '../../app/GenerationIndicator'
import { useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { BookOpenText, Check, Pencil, RefreshCw } from 'lucide-react'
import { studyApi } from '../../api/endpoints/study'
import { qk } from '../../api/queryKeys'
import type { NotesDto } from '../../api/types'
import { useNotes } from '../../data/hooks'
import { Button } from '../../ui/Button'
import { EmptyState, ErrorNotice, ProgressBar, SaveIndicator, Skeleton } from '../../ui/Feedback'
import { PageRef } from '../../ui/PageRef'
import { RichText } from '../../ui/RichText'
import { cn } from '../../ui/cn'
import { useDocumentContext } from '../document/context'
import { NotesEditor } from './NotesEditor'
import '@fontsource-variable/source-serif-4/opsz.css'

export default function NotesPage() {
  const { doc } = useDocumentContext()
  const notes = useNotes(doc.id)
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [confirmRegen, setConfirmRegen] = useState(false)
  const generate = useAiJob(doc.id, 'notes', {
    run: (_, signal) => studyApi.generateNotes(doc.id, signal),
    onSuccess: (n) => {
      qc.setQueryData(qk.notes(doc.id), n)
      setConfirmRegen(false)
      setEditing(false)
    },
  })

  if (notes.isPending) return <NotesSkeleton />
  if (notes.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <ErrorNotice error={notes.error} onRetry={() => notes.refetch()} />
      </div>
    )
  }
  if (!notes.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <EmptyState
          icon={<BookOpenText className="size-5" />}
          title="No notes yet"
          body="Generate structured study notes: sections by topic, concise points, each section linked to the page it comes from. You can edit them afterwards."
          action={
            <div className="flex w-full flex-col items-start gap-3">
              <Button variant="primary" busy={generate.isPending} disabled={!!generate.blockedBy} onClick={() => generate.mutate()}>
                {generate.isPending ? 'Writing notes…' : 'Generate notes'}
              </Button>
              {generate.isPending && (
                <div className="flex w-full max-w-sm items-center gap-3">
                  <ProgressBar label="Writing notes" className="flex-1" />
                  <StopButton onStop={generate.stop} stopping={generate.stopping} />
                </div>
              )}
              <BusyNote job={generate.blockedBy} />
              {generate.error ? <ErrorNotice error={generate.error} onRetry={() => generate.mutate()} className="w-full" /> : null}
            </div>
          }
        />
      </div>
    )
  }

  return (
    <NotesView
      key={doc.id}
      notes={notes.data}
      editing={editing}
      setEditing={setEditing}
      confirmRegen={confirmRegen}
      setConfirmRegen={setConfirmRegen}
      regenerate={() => generate.mutate()}
      regenerating={generate.isPending}
      stopRegenerate={generate.stop}
      regenerateError={generate.error}
    />
  )
}

function NotesView({
  notes,
  editing,
  setEditing,
  confirmRegen,
  setConfirmRegen,
  regenerate,
  regenerating,
  stopRegenerate,
  regenerateError,
}: {
  notes: NotesDto
  editing: boolean
  setEditing: (v: boolean) => void
  confirmRegen: boolean
  setConfirmRegen: (v: boolean) => void
  regenerate: () => void
  regenerating: boolean
  stopRegenerate: () => void
  regenerateError: unknown
}) {
  const { doc } = useDocumentContext()
  const [params] = useSearchParams()
  const near = Number(params.get('near'))
  const sectionRefs = useRef<Array<HTMLElement | null>>([])
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [retrySave, setRetrySave] = useState<(() => void) | undefined>()

  // Jump to the section closest to `?near=page` (e.g. "Open in notes" from a concept).
  const target = useMemo(() => {
    if (!near) return -1
    let best = -1
    let bestD = Infinity
    notes.sections.forEach((s, i) => {
      const d = Math.abs(s.page_number - near)
      if (d < bestD) {
        best = i
        bestD = d
      }
    })
    return best
  }, [near, notes.sections])
  useEffect(() => {
    if (target < 0) return
    const el = sectionRefs.current[target]
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    el?.focus({ preventScroll: true })
  }, [target])

  return (
    <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-6 md:px-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Notes outline" className="hidden lg:block">
        <div className="sticky top-32">
          <p className="eyebrow mb-2">Outline</p>
          <ol className="flex flex-col border-l border-line">
            {notes.sections.map((s, i) => (
              <li key={i}>
                <a
                  href={`#section-${i}`}
                  onClick={(e) => {
                    e.preventDefault()
                    sectionRefs.current[i]?.scrollIntoView({ block: 'start', behavior: 'smooth' })
                  }}
                  className={cn(
                    '-ml-px block border-l py-1.5 pl-3 text-sm transition-colors',
                    i === target ? 'border-signal text-text' : 'border-transparent text-text-3 hover:text-text-2',
                  )}
                >
                  {s.heading}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </nav>

      <article className="min-w-0">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
          <div className="min-w-0">
            <p className="eyebrow">{notes.source === 'user' ? 'Edited by you' : 'Generated from the document'}</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold">{notes.title}</h2>
          </div>
          <div className="flex items-center gap-2">
            {editing && <SaveIndicator state={saveState} onRetry={retrySave} />}
            <Button
              size="sm"
              variant={editing ? 'primary' : 'secondary'}
              icon={editing ? <Check className="size-4" /> : <Pencil className="size-4" />}
              onClick={() => setEditing(!editing)}
              disabled={saveState === 'saving'}
            >
              {editing ? 'Done' : 'Edit'}
            </Button>
            {!editing && (
              <Button size="sm" variant="ghost" icon={<RefreshCw className="size-4" />} onClick={() => setConfirmRegen(true)}>
                Regenerate
              </Button>
            )}
          </div>
        </header>

        {confirmRegen && (
          <div role="alertdialog" aria-labelledby="regen-title" className="mt-4 rounded-md border border-amber/50 tint-amber p-4">
            <p id="regen-title" className="font-medium">Regenerate these notes?</p>
            <p className="mt-1 text-base text-text-2">
              {notes.source === 'user'
                ? 'New AI notes will replace your edited version as the current notes. Your version stays saved on the server but isn’t shown here.'
                : 'New notes will replace these as the current version.'}
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="primary" busy={regenerating} onClick={regenerate}>
                Regenerate
              </Button>
              {regenerating ? (
                <StopButton onStop={stopRegenerate} />
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirmRegen(false)}>
                  Cancel
                </Button>
              )}
            </div>
            {regenerateError ? <ErrorNotice className="mt-3" error={regenerateError} onRetry={regenerate} /> : null}
          </div>
        )}

        {editing ? (
          <NotesEditor
            docId={doc.id}
            pageCount={doc.page_count}
            notes={notes}
            onStateChange={(state, retry) => {
              setSaveState(state)
              setRetrySave(() => retry)
            }}
          />
        ) : (
          <div className="mt-2">
            {notes.sections.map((section, i) => (
              <section
                key={i}
                id={`section-${i}`}
                tabIndex={-1}
                ref={(el) => {
                  sectionRefs.current[i] = el
                }}
                className={cn(
                  'scroll-mt-32 rounded-2xl py-6 outline-none',
                  i === target && 'motion-safe:animate-[note-flash_1.6s_var(--ease-standard)]',
                )}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-xl font-bold tracking-[-0.01em] text-text">{section.heading}</h3>
                  <PageRef page={section.page_number} />
                </div>
                {section.paragraphs?.length ? (
                  <div className="note-prose mt-3">
                    {section.paragraphs.map((para, j) => (
                      <p key={j}>
                        <RichText text={para} />
                      </p>
                    ))}
                  </div>
                ) : (
                  // Notes saved before the paragraph format.
                  <ul className="note-prose mt-3 flex flex-col gap-2">
                    {(section.bullets ?? []).map((b, j) => (
                      <li key={j} className="relative pl-5 before:absolute before:top-[0.85em] before:left-0 before:h-px before:w-2.5 before:bg-text-3">
                        <RichText text={b} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </article>
    </div>
  )
}

function NotesSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8" aria-busy="true">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-3 h-8 w-2/3" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="mt-8 flex flex-col gap-2">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ))}
    </div>
  )
}
