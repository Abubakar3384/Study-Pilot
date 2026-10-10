import { create } from 'zustand'
import { describeError } from '../api/errors'
import { toast } from '../ui/toast'
import { appNavigate } from '../app/navigator'

/**
 * App-wide tracker for AI work (summaries, notes, quizzes, flashcards, concept maps, chat answers).
 *
 * - It lives outside any screen, so a request keeps its "Generating…" state when you switch tabs or
 *   leave the document, and its result is written to the cache the moment the server answers.
 * - Only one AI job runs at a time. A local model (Ollama) handles one request at a time, so every
 *   other AI action is disabled while a job runs, with a note saying what it's waiting for.
 */

export type GenKind = 'summary' | 'notes' | 'concepts' | 'quiz' | 'flashcards' | 'chat'

export interface Job {
  key: string
  docId: string
  kind: GenKind
  status: 'running' | 'error'
  error?: unknown
  /** Free-form context, e.g. the question being asked or the quiz's focus pages. */
  meta?: Record<string, unknown>
}

export const KIND_LABEL: Record<GenKind, string> = {
  summary: 'the summary',
  notes: 'notes',
  concepts: 'the concept map',
  quiz: 'a quiz',
  flashcards: 'flashcards',
  chat: 'an answer',
}

interface GenState {
  jobs: Record<string, Job>
}

export const useGenerations = create<GenState>(() => ({ jobs: {} }))

const keyOf = (docId: string, kind: GenKind) => `${docId}:${kind}`

function setJob(job: Job | null, key: string) {
  useGenerations.setState((s) => {
    const jobs = { ...s.jobs }
    if (job) jobs[key] = job
    else delete jobs[key]
    return { jobs }
  })
}

export function runningJob(): Job | undefined {
  return Object.values(useGenerations.getState().jobs).find((j) => j.status === 'running')
}

/**
 * Start an AI job. Returns undefined (and does nothing) if another job is running.
 * `onSuccess` runs whether or not the screen that started the job is still on screen.
 */
export async function runGeneration<T>(
  docId: string,
  kind: GenKind,
  fn: () => Promise<T>,
  opts: { onSuccess?: (result: T) => void; onError?: (error: unknown) => void; meta?: Record<string, unknown>; silentError?: boolean } = {},
): Promise<T | undefined> {
  const busy = runningJob()
  if (busy) {
    toast.info(`Please wait: StudyPilot is still generating ${KIND_LABEL[busy.kind]}.`)
    return undefined
  }
  const key = keyOf(docId, kind)
  setJob({ key, docId, kind, status: 'running', meta: opts.meta }, key)
  try {
    const result = await fn()
    setJob(null, key)
    opts.onSuccess?.(result)
    return result
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      setJob(null, key)
      return undefined
    }
    setJob({ key, docId, kind, status: 'error', error, meta: opts.meta }, key)
    opts.onError?.(error)
    if (!opts.silentError) toast.error(`Couldn’t generate ${KIND_LABEL[kind]}: ${describeError(error)}`)
    return undefined
  }
}

export function clearJob(docId: string, kind: GenKind) {
  setJob(null, keyOf(docId, kind))
}

/** State of one kind of job for one document, plus whatever is blocking new jobs. */
export function useGeneration(docId: string, kind: GenKind) {
  const job = useGenerations((s) => s.jobs[keyOf(docId, kind)])
  const busy = useGenerations((s) => Object.values(s.jobs).find((j) => j.status === 'running'))
  return {
    running: job?.status === 'running',
    error: job?.status === 'error' ? job.error : undefined,
    meta: job?.meta,
    /** Another AI job is running, so this one can't start yet. */
    blockedBy: busy && busy.key !== keyOf(docId, kind) ? busy : undefined,
    clear: () => clearJob(docId, kind),
  }
}

/** Any running AI job (for the global indicator and for disabling AI actions). */
export function useRunningJob(): Job | undefined {
  return useGenerations((s) => Object.values(s.jobs).find((j) => j.status === 'running'))
}

/** Resolves once no AI job is running (used by the upload pipeline to queue its steps). */
export function waitForIdle(): Promise<void> {
  if (!runningJob()) return Promise.resolve()
  return new Promise((resolve) => {
    const unsubscribe = useGenerations.subscribe(() => {
      if (!runningJob()) {
        unsubscribe()
        resolve()
      }
    })
  })
}

/** Like runGeneration, but for callers that handle errors themselves (the upload panel). */
export async function trackGeneration<T>(docId: string, kind: GenKind, fn: () => Promise<T>): Promise<T> {
  const key = keyOf(docId, kind)
  setJob({ key, docId, kind, status: 'running' }, key)
  try {
    return await fn()
  } finally {
    setJob(null, key)
  }
}

/**
 * Drop-in for a generation `useMutation`, backed by the app-wide tracker: `isPending` and `error`
 * survive leaving and returning to the screen, and `disabled` is true while any AI job runs.
 */
export function useAiJob<TArg = void, T = unknown>(
  docId: string,
  kind: GenKind,
  opts: {
    run: (arg: TArg) => Promise<T>
    onSuccess?: (result: T, arg: TArg, ctx: { stillHere: boolean }) => void
    onError?: (error: unknown, arg: TArg) => void
  },
) {
  const state = useGeneration(docId, kind)
  return {
    isPending: state.running,
    error: state.error,
    blockedBy: state.blockedBy,
    disabled: state.running || !!state.blockedBy,
    /** The argument of the running (or failed) job, e.g. how many cards were requested. */
    variables: state.meta?.arg as TArg | undefined,
    mutate: (arg: TArg) => {
      const startedOn = window.location.pathname
      void runGeneration(docId, kind, () => opts.run(arg), {
        onSuccess: (r) => opts.onSuccess?.(r, arg, { stillHere: window.location.pathname === startedOn }),
        onError: (e) => opts.onError?.(e, arg),
        meta: { arg },
        silentError: true,
      })
    },
    reset: state.clear,
  }
}

/** After a quiz is generated: open it if the student is still where they asked, otherwise offer it. */
export function offerQuiz(docId: string, quizId: string, stillHere: boolean) {
  const path = `/d/${docId}/quiz/${quizId}`
  if (stillHere) appNavigate(path)
  else toast.info('Your quiz is ready.', { label: 'Start quiz', onClick: () => appNavigate(path) })
}
