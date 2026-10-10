import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { studyApi } from '../../api/endpoints/study'
import { qk } from '../../api/queryKeys'
import type { NotesDto, NotesEditDto } from '../../api/types'
import { Button, IconButton } from '../../ui/Button'

interface DraftSection {
  key: number
  heading: string
  page_number: number
  bullets: Array<{ key: number; text: string }>
}

let nextKey = 1
const toDraft = (notes: NotesDto): DraftSection[] =>
  notes.sections.map((s) => ({
    key: nextKey++,
    heading: s.heading,
    page_number: s.page_number,
    bullets: s.bullets.map((text) => ({ key: nextKey++, text })),
  }))

/** Empty bullets and headings are dropped before saving; the server requires non-empty text. */
export function toPayload(title: string, sections: DraftSection[]): NotesEditDto | null {
  const clean = sections
    .map((s) => ({ heading: s.heading.trim(), page_number: s.page_number, bullets: s.bullets.map((b) => b.text.trim()).filter(Boolean) }))
    .filter((s) => s.heading && s.bullets.length)
  if (!title.trim() || clean.length === 0) return null
  return { title: title.trim(), sections: clean }
}

const AUTOSAVE_MS = 800

/**
 * Inline editor with debounced autosave. Each save creates a new notes version on the server
 * (earlier ones are kept); the indicator reports exactly what the last request did.
 */
export function NotesEditor({
  docId,
  pageCount,
  notes,
  onStateChange,
}: {
  docId: string
  pageCount: number
  notes: NotesDto
  onStateChange: (state: 'idle' | 'saving' | 'saved' | 'error', retry?: () => void) => void
}) {
  const qc = useQueryClient()
  const [title, setTitle] = useState(notes.title)
  const [sections, setSections] = useState(() => toDraft(notes))
  const [invalid, setInvalid] = useState(false)
  const dirty = useRef(false)
  const seq = useRef(0)

  const save = async (payload: NotesEditDto) => {
    const mine = ++seq.current
    onStateChange('saving')
    try {
      const saved = await studyApi.saveNotes(docId, payload)
      if (mine !== seq.current) return
      qc.setQueryData(qk.notes(docId), saved)
      onStateChange('saved')
    } catch {
      if (mine === seq.current) onStateChange('error', () => void save(payload))
    }
  }

  useEffect(() => {
    if (!dirty.current) return
    const payload = toPayload(title, sections)
    setInvalid(!payload)
    if (!payload) return
    const id = window.setTimeout(() => void save(payload), AUTOSAVE_MS)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, sections])

  const edit = (fn: (draft: DraftSection[]) => DraftSection[]) => {
    dirty.current = true
    setSections((s) => fn(structuredClone(s)))
  }

  return (
    <div className="mt-4 flex flex-col gap-6">
      <label className="block">
        <span className="eyebrow">Title</span>
        <input
          value={title}
          onChange={(e) => {
            dirty.current = true
            setTitle(e.target.value)
          }}
          className="mt-1 w-full rounded-sm border border-line-strong bg-surface-1 px-3 py-2 font-serif text-xl font-semibold focus:border-signal focus:outline-none"
        />
      </label>
      {invalid && (
        <p role="status" className="text-sm text-amber">
          Not saved yet: notes need a title and at least one section with a heading and a point.
        </p>
      )}
      {sections.map((section, si) => (
        <fieldset key={section.key} className="card p-4">
          <legend className="sr-only">Section {si + 1}</legend>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[200px] flex-1">
              <span className="eyebrow">Heading</span>
              <input
                value={section.heading}
                onChange={(e) => edit((d) => ((d[si]!.heading = e.target.value), d))}
                className="mt-1 w-full rounded-sm border border-line-strong bg-ink px-3 py-1.5 font-serif text-lg font-semibold focus:border-signal focus:outline-none"
              />
            </label>
            <label className="w-24">
              <span className="eyebrow">Page</span>
              <input
                type="number"
                min={1}
                max={pageCount}
                value={section.page_number}
                onChange={(e) => edit((d) => ((d[si]!.page_number = Math.min(pageCount, Math.max(1, Number(e.target.value) || 1))), d))}
                className="mt-1 w-full rounded-sm border border-line-strong bg-ink px-2 py-1.5 font-mono text-base tabular focus:border-signal focus:outline-none"
              />
            </label>
            <IconButton label={`Delete section ${si + 1}`} variant="danger" onClick={() => edit((d) => d.filter((_, i) => i !== si))}>
              <Trash2 className="size-4" />
            </IconButton>
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {section.bullets.map((bullet, bi) => (
              <li key={bullet.key} className="flex items-start gap-2">
                <AutoTextarea
                  label={`Point ${bi + 1} of section ${si + 1}`}
                  value={bullet.text}
                  onChange={(v) => edit((d) => ((d[si]!.bullets[bi]!.text = v), d))}
                />
                <IconButton size="sm" label={`Delete point ${bi + 1}`} onClick={() => edit((d) => (d[si]!.bullets.splice(bi, 1), d))}>
                  <Trash2 className="size-3.5" />
                </IconButton>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="ghost" className="mt-2" icon={<Plus className="size-4" />} onClick={() => edit((d) => (d[si]!.bullets.push({ key: nextKey++, text: '' }), d))}>
            Add point
          </Button>
        </fieldset>
      ))}
      <Button
        className="self-start"
        icon={<Plus className="size-4" />}
        onClick={() => edit((d) => [...d, { key: nextKey++, heading: '', page_number: d.at(-1)?.page_number ?? 1, bullets: [{ key: nextKey++, text: '' }] }])}
      >
        Add section
      </Button>
    </div>
  )
}

function AutoTextarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      aria-label={label}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-9 flex-1 resize-none overflow-hidden rounded-sm border border-line-strong bg-ink px-3 py-1.5 font-serif text-md leading-relaxed focus:border-signal focus:outline-none"
    />
  )
}
