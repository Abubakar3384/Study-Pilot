import { create } from 'zustand'
import { describeError } from '../api/errors'
import { toast } from '../ui/toast'
import { appNavigate } from '../app/navigator'
import { api } from '../api/client'

/**
 * App-wide tracker for AI work (summaries, notes, quizzes, flashcards, concept maps, chat answers).
 *
 * - It lives outside any screen, so a request keeps its "Generating…" state when you switch tabs or
 *   leave the document, and its result is written to the cache the moment the server answers.
 * - Only one AI job runs at a time. A local model (Ollama) handles one request at a time, so every
 *   other AI action is disabled while a job runs, with a note saying what it's waiting for.
 * - Any job can be stopped. The request is aborted and the server is told to stop the model; the job
 *   keeps blocking new ones until the server has acknowledged, so the next request can't be the one
 *   that gets cancelled.
 */

export type GenKind = 'summary' | 'notes' | 'concepts' | 'quiz' | 'flashcards' | 'chat'

export interface Job {
  key: string
  docId: string
  kind: GenKind
  status: 'running' | 'error'
  /** Stop was pressed; waiting for the server to let go of the model. */
  stopping?: boolean
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

/** Abort handles for running jobs (kept out of the store: they aren't render state). */
const controllers = new Map<string, { abort: AbortController; stopping?: Promise<void> }>()

function startJob(key: string, job: Job, outer?: AbortSignal): AbortSignal {
  const abort = new AbortController()
  controllers.set(key, { abort })
  setJob(job, key)
  outer?.addEventListener('abort', () => stopJob(key), { once: true })
  return abort.signal
}

function stopJob(key: string) {
  const entry = controllers.get(key)
  const job = useGenerations.getState().jobs[key]
  if (!entry || entry.stopping || job?.status !== 'running') return
  entry.stopping = api<void>('/ai/cancel', { method: 'POST' }).catch(() => undefined)
  setJob({ ...job, stopping: true }, key)
  entry.abort.abort()
}

/** Wait for the server to drop a stopped job, then forget it. */
async function finishStopped(key: string) {
  await controllers.get(key)?.stopping
  controllers.delete(key)
  setJob(null, key)
}

const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError'

/** Stop one kind of job for a document, or (without arguments) whatever is running. */
export function stopGeneration(docId?: string, kind?: GenKind) {
  const job = docId && kind ? useGenerations.getState().jobs[keyOf(docId, kind)] : runningJob()
  if (job) stopJob(job.key)
}

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
  fn: (signal: AbortSignal) => Promise<T>,
  opts: {
    onSuccess?: (result: T) => void
    onError?: (error: unknown) => void
    onStop?: () => void
    meta?: Record<string, unknown>
    silentError?: boolean
  } = {},
): Promise<T | undefined> {
  const busy = runningJob()
  if (busy) {
    toast.info(`Please wait: StudyPilot is still generating ${KIND_LABEL[busy.kind]}.`)
    return undefined
  }
  const key = keyOf(docId, kind)
  const signal = startJob(key, { key, docId, kind, status: 'running', meta: opts.meta })
  try {
    const result = await fn(signal)
    controllers.delete(key)
    setJob(null, key)
    opts.onSuccess?.(result)
    return result
  } catch (error) {
    if (isAbort(error) || signal.aborted) {
      await finishStopped(key)
      opts.onStop?.()
      toast.info(`Stopped generating ${KIND_LABEL[kind]}.`)
      return undefined
    }
    controllers.delete(key)
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
    stopping: !!job?.stopping,
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

/**
 * Like runGeneration, but for callers that handle errors themselves (the upload panel). Aborting
 * `outer` stops the job like the Stop button does; a stopped job rejects with an AbortError.
 */
export async function trackGeneration<T>(
  docId: string,
  kind: GenKind,
  fn: (signal: AbortSignal) => Promise<T>,
  outer?: AbortSignal,
): Promise<T> {
  const key = keyOf(docId, kind)
  const signal = startJob(key, { key, docId, kind, status: 'running' }, outer)
  if (outer?.aborted) stopJob(key)
  try {
    return await fn(signal)
  } catch (error) {
    if (signal.aborted) {
      await finishStopped(key)
      throw new DOMException('Stopped', 'AbortError')
    }
    throw error
  } finally {
    controllers.delete(key)
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
    run: (arg: TArg, signal: AbortSignal) => Promise<T>
    onSuccess?: (result: T, arg: TArg, ctx: { stillHere: boolean }) => void
    onError?: (error: unknown, arg: TArg) => void
    onStop?: (arg: TArg) => void
  },
) {
  const state = useGeneration(docId, kind)
  return {
    isPending: state.running,
    stopping: state.stopping,
    error: state.error,
    blockedBy: state.blockedBy,
    disabled: state.running || !!state.blockedBy,
    /** The argument of the running (or failed) job, e.g. how many cards were requested. */
    variables: state.meta?.arg as TArg | undefined,
    mutate: (arg: TArg) => {
      const startedOn = window.location.pathname
      void runGeneration(docId, kind, (signal) => opts.run(arg, signal), {
        onSuccess: (r) => opts.onSuccess?.(r, arg, { stillHere: window.location.pathname === startedOn }),
        onError: (e) => opts.onError?.(e, arg),
        onStop: () => opts.onStop?.(arg),
        meta: { arg },
        silentError: true,
      })
    },
    reset: state.clear,
    stop: () => stopGeneration(docId, kind),
  }
}

/** After a quiz is generated: open it if the student is still where they asked, otherwise offer it. */
export function offerQuiz(docId: string, quizId: string, stillHere: boolean) {
  const path = `/d/${docId}/quiz/${quizId}`
  if (stillHere) appNavigate(path)
  else toast.info('Your quiz is ready.', { label: 'Start quiz', onClick: () => appNavigate(path) })
}
