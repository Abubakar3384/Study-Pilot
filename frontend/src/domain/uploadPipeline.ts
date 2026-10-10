import type { DocumentDto } from '../api/types'
import type { KnowledgeGraph, SceneInput } from './types'

/**
 * Upload → read → generate, as a pure reducer over real events. Nothing here is timed or
 * estimated: each step changes only when the network or the server says so.
 */

export type StepStatus = 'pending' | 'active' | 'done' | 'failed'
export type GenerationStep = 'summary' | 'concepts'

export interface UploadSteps {
  upload: StepStatus
  read: StepStatus
  summary: StepStatus
  concepts: StepStatus
}

export type UploadPhase = 'idle' | 'uploading' | 'reading' | 'generating' | 'ready' | 'failed' | 'cancelled'

export interface UploadState {
  /** Increments per upload so late responses from an old upload can be ignored. */
  session: number
  phase: UploadPhase
  fileName: string | null
  fileSize: number
  /** Bytes sent, 0..1. Only meaningful while uploading. */
  progress: number
  document: DocumentDto | null
  steps: UploadSteps
  errors: Partial<Record<keyof UploadSteps, unknown>>
  /** The user stopped waiting for generation; the server may still finish it. */
  stoppedWaiting: boolean
}

export type UploadEvent =
  | { type: 'start'; fileName: string; fileSize: number }
  | { type: 'progress'; fraction: number }
  | { type: 'uploaded' }
  | { type: 'document'; document: DocumentDto }
  | { type: 'uploadFailed'; error: unknown }
  | { type: 'stepStarted'; step: GenerationStep }
  | { type: 'stepDone'; step: GenerationStep }
  | { type: 'stepFailed'; step: GenerationStep; error: unknown }
  | { type: 'stopWaiting' }
  | { type: 'cancelled' }
  | { type: 'reset' }

const PENDING: UploadSteps = { upload: 'pending', read: 'pending', summary: 'pending', concepts: 'pending' }

export const initialUploadState: UploadState = {
  session: 0,
  phase: 'idle',
  fileName: null,
  fileSize: 0,
  progress: 0,
  document: null,
  steps: PENDING,
  errors: {},
  stoppedWaiting: false,
}

function settle(state: UploadState): UploadState {
  const { summary, concepts } = state.steps
  const busy = summary === 'active' || concepts === 'active'
  return { ...state, phase: busy ? 'generating' : 'ready' }
}

export function uploadReducer(state: UploadState, event: UploadEvent): UploadState {
  switch (event.type) {
    case 'start':
      return {
        ...initialUploadState,
        session: state.session + 1,
        phase: 'uploading',
        fileName: event.fileName,
        fileSize: event.fileSize,
        steps: { ...PENDING, upload: 'active' },
      }
    case 'progress':
      if (state.phase !== 'uploading') return state
      return { ...state, progress: Math.max(state.progress, Math.min(1, event.fraction)) }
    case 'uploaded':
      if (state.phase !== 'uploading') return state
      return { ...state, phase: 'reading', progress: 1, steps: { ...state.steps, upload: 'done', read: 'active' } }
    case 'document': {
      const doc = event.document
      const steps = { ...state.steps, upload: 'done' as const }
      if (doc.status === 'failed') {
        return { ...state, phase: 'failed', document: doc, steps: { ...steps, read: 'failed' }, errors: { read: doc.error } }
      }
      if (doc.status === 'processing') {
        return { ...state, phase: 'reading', document: doc, steps: { ...steps, read: 'active' } }
      }
      return { ...state, phase: 'generating', document: doc, steps: { ...steps, read: 'done' } }
    }
    case 'uploadFailed': {
      const failedStep = state.steps.upload === 'done' ? 'read' : 'upload'
      return {
        ...state,
        phase: 'failed',
        steps: { ...state.steps, [failedStep]: 'failed' },
        errors: { ...state.errors, [failedStep]: event.error },
      }
    }
    case 'stepStarted': {
      if (!state.document) return state
      const errors = { ...state.errors }
      delete errors[event.step]
      return { ...state, phase: 'generating', stoppedWaiting: false, steps: { ...state.steps, [event.step]: 'active' }, errors }
    }
    case 'stepDone':
      return settle({ ...state, steps: { ...state.steps, [event.step]: 'done' } })
    case 'stepFailed':
      return settle({
        ...state,
        steps: { ...state.steps, [event.step]: 'failed' },
        errors: { ...state.errors, [event.step]: event.error },
      })
    case 'stopWaiting':
      return { ...state, stoppedWaiting: true }
    case 'cancelled':
      return { ...state, phase: 'cancelled', steps: { ...state.steps, upload: state.steps.upload === 'done' ? 'done' : 'failed' } }
    case 'reset':
      return { ...initialUploadState, session: state.session }
  }
}

/** The knowledge-canvas state that matches the pipeline (and nothing more). */
export function sceneInputFor(state: UploadState, graph: KnowledgeGraph | null): SceneInput {
  switch (state.phase) {
    case 'idle':
    case 'cancelled':
      return { kind: 'empty' }
    case 'uploading':
    case 'reading':
      return { kind: 'ingesting' }
    case 'failed':
      return state.document?.page_count
        ? { kind: 'pages', pageCount: state.document.page_count, working: false, failed: true }
        : { kind: 'ingesting' }
    case 'generating':
    case 'ready': {
      if (graph && state.steps.concepts === 'done') return { kind: 'graph', graph, animate: true }
      return {
        kind: 'pages',
        pageCount: state.document?.page_count ?? 1,
        working: state.steps.concepts === 'active' && !state.stoppedWaiting,
        failed: state.steps.concepts === 'failed',
      }
    }
  }
}
