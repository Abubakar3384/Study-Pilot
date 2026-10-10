import { useState, type ComponentType, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
  ArrowRight, Award, BookOpen, Brain, CalendarCheck, Check, FileText, Layers, ListChecks, Lock, MessageSquareText, Plus,
  Lightbulb, RotateCcw, Search, Trophy, Upload,
} from 'lucide-react'
import type { DocumentDto } from '../../api/types'
import { documentTitle, timeAgo } from '../../data/format'
import type { Badge, Challenge, DayBucket, Stats } from '../../domain/dashboardStats'
import { cn } from '../../ui/cn'
import { warmDocument } from '../library/DocumentRow'
import { useUpload } from '../upload/uploadStore'

type Tone = 'blue' | 'lavender' | 'pink' | 'mint' | 'butter'
const TONES: Tone[] = ['blue', 'lavender', 'pink', 'mint', 'butter']
type Icon = ComponentType<{ className?: string }>

export function CardHeader({ title, count, action }: { title: string; count?: number; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <h2 className="text-lg font-semibold tracking-[-0.01em] text-text">{title}</h2>
      {count !== undefined && (
        <span className="tile-blue inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 font-mono text-xs font-medium">{count}</span>
      )}
      <div className="ml-auto flex items-center gap-1">{action}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ stat tiles */

function StatTile({ tone, label, value, sub, icon: Icon }: { tone: Tone; label: string; value: ReactNode; sub?: string; icon: Icon }) {
  return (
    <div className={cn(`tile-${tone}`, 'relative overflow-hidden rounded-[22px] p-5')}>
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium opacity-80">{label}</p>
        <span className="flex size-9 items-center justify-center rounded-full bg-surface-1/70">
          <Icon className="size-[18px]" />
        </span>
      </div>
      <p className="mt-3 font-mono text-3xl font-medium tracking-tight tabular">{value}</p>
      {sub && <p className="mt-1 text-sm opacity-75">{sub}</p>}
    </div>
  )
}

export function StatTiles({ stats }: { stats: Stats }) {
  return (
    <section aria-label="Your study at a glance" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatTile tone="blue" icon={FileText} label="Documents" value={stats.documents} sub="ready to study" />
      <StatTile
        tone="lavender"
        icon={ListChecks}
        label="Quiz average"
        value={stats.averageScore === null ? '–' : `${stats.averageScore}%`}
        sub={stats.quizzesTaken ? `over ${stats.quizzesTaken} recent quiz${stats.quizzesTaken === 1 ? '' : 'zes'}` : 'no quizzes yet'}
      />
      <StatTile tone="pink" icon={Layers} label="Cards due" value={stats.cardsDue} sub={stats.cardsDue ? 'ready to review now' : 'all caught up'} />
      <StatTile tone="mint" icon={MessageSquareText} label="Questions asked" value={stats.questionsAsked} sub="answered with citations" />
    </section>
  )
}

/* ------------------------------------------------------------------ challenges */

const CHALLENGE_ICON: Record<Challenge['kind'], { icon: Icon; tone: Tone }> = {
  cards: { icon: Layers, tone: 'pink' },
  retake: { icon: RotateCcw, tone: 'butter' },
  quiz: { icon: Brain, tone: 'lavender' },
}

export function ChallengesCard({ challenges }: { challenges: Challenge[] }) {
  return (
    <section className="card p-5" aria-labelledby="challenges-title">
      <div id="challenges-title">
        <CardHeader title="Today’s challenges" count={challenges.length} />
      </div>
      {challenges.length === 0 ? (
        <div className="tile-mint flex items-center gap-3 rounded-2xl p-4">
          <Check className="size-5" aria-hidden />
          <p className="text-sm font-medium">All caught up. Upload or quiz yourself to keep going.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {challenges.map((c) => {
            const { icon: Icon, tone } = CHALLENGE_ICON[c.kind]
            return (
              <li key={c.id}>
                <Link
                  to={c.href}
                  onMouseEnter={warmDocument}
                  className={cn(`tile-${tone}`, 'group flex items-center gap-3 rounded-2xl p-3 transition-transform duration-200 hover:-translate-y-0.5')}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-1/75">
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{c.title}</span>
                    <span className="block truncate text-xs opacity-75">{c.detail}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ badges */

const BADGE_ICON: Record<string, Icon> = {
  'first-upload': Upload,
  'first-quiz': ListChecks,
  'high-score': Trophy,
  curious: Lightbulb,
  reviewer: Layers,
  regular: CalendarCheck,
}

export function BadgesCard({ badges }: { badges: Badge[] }) {
  const earned = badges.filter((b) => b.earned).length
  return (
    <section className="card p-5" aria-labelledby="badges-title">
      <div id="badges-title">
        <CardHeader title="Badges" count={earned} action={<span className="text-xs text-text-3">{earned} of {badges.length} earned</span>} />
      </div>
      <ul className="grid grid-cols-3 gap-3">
        {badges.map((b) => {
          const Icon = BADGE_ICON[b.id] ?? Award
          return (
            <li key={b.id} className="flex flex-col items-center gap-1.5 text-center" title={b.earned ? b.title : `Locked: ${b.howTo}`}>
              <span
                className={cn(
                  'relative flex size-14 items-center justify-center rounded-full',
                  b.earned ? `tile-${b.tone} ring-4 ring-surface-1 shadow-[0_6px_16px_-8px_rgb(16_24_40/0.35)]` : 'bg-surface-2 text-text-3',
                )}
              >
                <Icon className="size-6" />
                {!b.earned && (
                  <span className="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full bg-surface-1 ring-1 ring-line">
                    <Lock className="size-3" aria-hidden />
                  </span>
                )}
              </span>
              <span className={cn('text-xs leading-tight font-medium', b.earned ? 'text-text' : 'text-text-3')}>{b.title}</span>
              {!b.earned && <span className="text-[11px] leading-tight text-text-3">{b.howTo}</span>}
              <span className="sr-only">{b.earned ? 'Earned' : 'Not earned yet'}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/* ------------------------------------------------------------------ activity chart */

const fmtDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/** One series (study actions per day), so no legend: the title names it. Hover or focus a bar for detail. */
export function ActivityChart({ days }: { days: DayBucket[] }) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(1, ...days.map((d) => d.total))
  const total = days.reduce((s, d) => s + d.total, 0)
  const activeDays = days.filter((d) => d.total > 0).length
  const shown = active !== null ? days[active]! : null
  return (
    <section className="card p-5" aria-labelledby="activity-title">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div>
          <h2 id="activity-title" className="text-lg font-semibold tracking-[-0.01em] text-text">
            Study activity
          </h2>
          <p className="text-sm text-text-2">Quizzes, card reviews and questions per day, last 14 days</p>
        </div>
        <div className="tile-blue rounded-2xl px-3 py-2 text-right">
          <p className="font-mono text-xl font-medium tabular">{total}</p>
          <p className="text-[11px] font-medium opacity-80">{activeDays} active day{activeDays === 1 ? '' : 's'}</p>
        </div>
      </div>

      <div className="relative mt-4 h-44">
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-line" aria-hidden />
        <span className="pointer-events-none absolute -top-2.5 right-0 bg-surface-1 pl-1 font-mono text-[11px] text-text-3">{max}</span>
        <div className="flex h-full items-end gap-[2px] border-b border-line-strong" aria-hidden>
          {days.map((d, i) => (
            <div
              key={d.date}
              className="group relative flex h-full flex-1 cursor-default items-end justify-center px-[3px]"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              <div
                className={cn('chart-bar w-full max-w-7 rounded-t-[4px] transition-opacity', active !== null && active !== i && 'opacity-45')}
                style={{ height: d.total ? `${Math.max(4, (d.total / max) * 100)}%` : '2px', opacity: d.total ? undefined : 0.35 }}
              />
            </div>
          ))}
        </div>
        {shown && (
          <div
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-surface-1 px-3 py-2 text-xs shadow-[0_10px_30px_-12px_rgb(16_24_40/0.35)]"
            style={{ left: `${((active! + 0.5) / days.length) * 100}%` }}
          >
            <p className="font-semibold text-text">{fmtDay(shown.date)}</p>
            <p className="text-text-2">
              {shown.quizzes} quiz{shown.quizzes === 1 ? '' : 'zes'} · {shown.reviews} review{shown.reviews === 1 ? '' : 's'} · {shown.questions} question
              {shown.questions === 1 ? '' : 's'}
            </p>
          </div>
        )}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[11px] text-text-3" aria-hidden>
        <span>{fmtDay(days[0]!.date)}</span>
        <span>{fmtDay(days[Math.floor(days.length / 2)]!.date)}</span>
        <span>Today</span>
      </div>

      <table className="sr-only">
        <caption>Study actions per day</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Quizzes</th>
            <th>Card reviews</th>
            <th>Questions</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <td>{fmtDay(d.date)}</td>
              <td>{d.quizzes}</td>
              <td>{d.reviews}</td>
              <td>{d.questions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

/* ------------------------------------------------------------------ documents */

export function DocumentsSection({ docs }: { docs: DocumentDto[] }) {
  const pickFile = useUpload((s) => s.pickFile)
  const recent = docs.filter((d) => d.status === 'ready').slice(0, 2)
  return (
    <section className="card p-5" aria-labelledby="docs-title">
      <div id="docs-title">
        <CardHeader
          title="Your documents"
          count={docs.length}
          action={
            <>
              <button type="button" onClick={pickFile} aria-label="Upload a PDF" className="flex size-9 items-center justify-center rounded-full text-text-2 transition-colors hover:bg-surface-2 hover:text-text">
                <Plus className="size-[18px]" />
              </button>
              <Link to="/library" aria-label="Search the library" className="flex size-9 items-center justify-center rounded-full text-text-2 transition-colors hover:bg-surface-2 hover:text-text">
                <Search className="size-[18px]" />
              </Link>
            </>
          }
        />
      </div>

      <ul className="scroll-slim -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
        {docs.map((d, i) => (
          <li key={d.id} className="shrink-0">
            <Link
              to={`/d/${d.id}`}
              onMouseEnter={warmDocument}
              className="flex w-28 flex-col items-center gap-2 rounded-2xl p-2 text-center transition-transform duration-200 hover:-translate-y-0.5"
            >
              <span className={cn(`tile-${TONES[i % TONES.length]}`, 'flex size-16 items-center justify-center rounded-2xl')}>
                <BookOpen className="size-7" />
              </span>
              <span className="line-clamp-2 text-xs leading-tight font-medium text-text">{documentTitle(d)}</span>
            </Link>
          </li>
        ))}
      </ul>

      {recent.length > 0 && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {recent.map((d, i) => (
            <Link
              key={d.id}
              to={`/d/${d.id}`}
              onMouseEnter={warmDocument}
              className={cn(i === 0 ? 'tile-butter' : 'tile-blue', 'group relative flex min-h-40 flex-col justify-between overflow-hidden rounded-[22px] p-5 transition-transform duration-300 hover:-translate-y-1')}
            >
              <div>
                <p className="text-xs font-semibold tracking-wide uppercase opacity-80">{i === 0 ? 'Pick up where you left off' : 'Also recent'}</p>
                <h3 className="mt-2 line-clamp-2 font-serif text-2xl leading-tight font-semibold">{documentTitle(d)}</h3>
                <p className="mt-1 text-sm opacity-80">
                  {d.page_count} pages · added {timeAgo(d.created_at)}
                </p>
              </div>
              <span className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-surface-1/80 px-3.5 py-1.5 text-sm font-semibold">
                Continue <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
              <BookOpen aria-hidden className="pointer-events-none absolute -right-4 -bottom-4 size-32 opacity-[0.08]" />
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
