import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowRight, BookOpen, Layers, ListChecks, MessageSquareText, Upload } from 'lucide-react'
import type { ActivityItemDto, ActivityType, DocumentDto } from '../../api/types'
import { documentTitle, timeAgo } from '../../data/format'
import type { Suggestion } from '../../domain/suggestions'
import { Button } from '../../ui/Button'
import { Skeleton } from '../../ui/Feedback'
import { useUpload } from '../upload/uploadStore'
import { warmDocument } from '../library/DocumentRow'

export function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="px-5 py-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-[-0.01em] text-text">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

const ACTIVITY_ICON: Record<ActivityType, typeof BookOpen> = {
  document_uploaded: Upload,
  quiz_attempt: ListChecks,
  conversation: MessageSquareText,
  flashcard_review: Layers,
}

/** Where an activity item leads when clicked. */
export function activityHref(item: ActivityItemDto): string {
  const base = `/d/${item.document_id}`
  switch (item.type) {
    case 'quiz_attempt':
      return item.quiz_id && item.attempt_id ? `${base}/quiz/${item.quiz_id}/attempts/${item.attempt_id}` : `${base}/quiz`
    case 'conversation':
      return item.conversation_id ? `${base}/ask/${item.conversation_id}` : `${base}/ask`
    case 'flashcard_review':
      return `${base}/cards`
    default:
      return base
  }
}

export function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const pickFile = useUpload((s) => s.pickFile)
  const href =
    suggestion.kind === 'due-cards'
      ? `/d/${suggestion.doc.id}/cards?due=1`
      : suggestion.kind === 'review-quiz'
        ? `/d/${suggestion.doc.id}/review`
        : suggestion.kind === 'first-quiz'
          ? `/d/${suggestion.doc.id}/quiz`
          : null
  return (
    <Panel title="Suggested next">
      <p className="text-md font-semibold text-text">{suggestion.title}</p>
      <p className="mt-1 text-base text-text-2">{suggestion.reason}</p>
      <div className="mt-3">
        {href ? (
          <Link
            to={href}
            onMouseEnter={warmDocument}
            className="inline-flex h-9 items-center gap-2 rounded-sm bg-signal px-3.5 text-base font-medium text-ink transition-colors hover:bg-signal/85"
          >
            Start <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <Button variant="primary" icon={<Upload className="size-4" />} onClick={pickFile}>
            Upload a PDF
          </Button>
        )}
      </div>
    </Panel>
  )
}

export function ContinueStudying({ item, doc }: { item: ActivityItemDto | undefined; doc: DocumentDto | undefined }) {
  if (!item || !doc) return null
  return (
    <Panel title="Continue studying">
      <Link to={activityHref(item)} onMouseEnter={warmDocument} className="group block">
        <p className="truncate text-md font-semibold text-text group-hover:text-signal">{documentTitle(doc)}</p>
        <p className="mt-0.5 text-base text-text-2">
          {item.summary} · {timeAgo(item.at)}
        </p>
      </Link>
    </Panel>
  )
}

export function DueCards({ counts }: { counts: Array<{ doc: DocumentDto; due: number; loaded: boolean }> }) {
  const due = counts.filter((c) => c.due > 0)
  const total = due.reduce((s, c) => s + c.due, 0)
  const loading = counts.some((c) => !c.loaded)
  return (
    <Panel title="Flashcards due">
      {loading && total === 0 ? (
        <Skeleton className="h-5 w-32" />
      ) : total === 0 ? (
        <p className="text-base text-text-2">Nothing due. Cards come back as their review dates arrive.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {due.map(({ doc, due: n }) => (
            <li key={doc.id}>
              <Link to={`/d/${doc.id}/cards?due=1`} className="flex items-center justify-between gap-3 rounded-sm py-1 text-base hover:text-signal">
                <span className="truncate">{documentTitle(doc)}</span>
                <span className="font-mono text-sm text-amber tabular">{n} due</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export function RecentActivity({ items, loading }: { items: ActivityItemDto[]; loading: boolean }) {
  return (
    <Panel title="Recent activity">
      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-base text-text-2">Your quizzes, reviews and questions will show up here.</p>
      ) : (
        <ol className="flex flex-col">
          {items.slice(0, 6).map((item) => {
            const Icon = ACTIVITY_ICON[item.type]
            return (
              <li key={`${item.type}-${item.attempt_id ?? item.conversation_id ?? item.document_id}-${item.at}`}>
                <Link to={activityHref(item)} className="group flex items-start gap-2.5 rounded-sm py-1.5">
                  <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-text-3 group-hover:text-signal" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base text-text group-hover:text-signal">{item.summary}</span>
                    <span className="block truncate font-mono text-xs text-text-3">
                      {documentTitle({ filename: item.document_filename })} · {timeAgo(item.at)}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </Panel>
  )
}
