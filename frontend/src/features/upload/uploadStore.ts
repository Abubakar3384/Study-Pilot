import { create } from 'zustand'
import { documentsApi } from '../../api/endpoints/documents'
import { studyApi } from '../../api/endpoints/study'
import { toKnowledgeGraph } from '../../api/mappers'
import { queryClient } from '../../api/queryClient'
import { qk } from '../../api/queryKeys'
import type { DocumentDto } from '../../api/types'
import { precheckFile, uploadDocument } from '../../api/upload'
import { markFormed } from '../../domain/formed'
import type { KnowledgeGraph } from '../../domain/types'
import {
  initialUploadState, uploadReducer, type GenerationStep, type UploadEvent, type UploadState,
} from '../../domain/uploadPipeline'
import { prefetchCanvas } from '../../graph/loadCanvas'
import { trackGeneration, waitForIdle } from '../../data/generation'
import { ApiError } from '../../api/errors'
import { toast } from '../../ui/toast'

interface UploadStore {
  state: UploadState
  graph: KnowledgeGraph | null
  /** Inline validation message for the last rejected file (not a server error). */
  rejection: string | null
  pickFile: () => void
  start: (file: File) => void
  /** Cancels the upload, or stops waiting for generation (the server may still finish). */
  cancel: () => void
  retryRead: () => void
  retryStep: (step: GenerationStep) => void
  reset: () => void
  /** Wired by <UploadBridge> in the app shell. */
  bind: (input: HTMLInputElement | null, navigate: ((to: string) => void) | null) => void
}

let fileInput: HTMLInputElement | null = null
let navigateTo: ((to: string) => void) | null = null
let uploadAbort: AbortController | null = null
let generationAbort: AbortController | null = null
const POLL_MS = 1500
const stoppedError = () => new ApiError(0, 'ai_cancelled', 'Stopped. Retry when you’re ready.')

export const useUpload = create<UploadStore>((set, get) => {
  const dispatch = (event: UploadEvent) => set((s) => ({ state: uploadReducer(s.state, event) }))
  const current = (session: number) => get().state.session === session

  const refreshLists = () => {
    void queryClient.invalidateQueries({ queryKey: qk.documents, exact: true })
    void queryClient.invalidateQueries({ queryKey: qk.activity })
  }

  const runStep = async (session: number, doc: DocumentDto, step: GenerationStep) => {
    dispatch({ type: 'stepStarted', step })
    const signal = generationAbort?.signal
    try {
      // One AI request at a time: wait for anything else (e.g. notes started elsewhere) to finish.
      await waitForIdle()
      if (signal?.aborted) throw new DOMException('Stopped', 'AbortError')
      if (step === 'summary') {
        const summary = await trackGeneration(doc.id, 'summary', (s) => studyApi.generateSummary(doc.id, s), signal)
        queryClient.setQueryData(qk.summary(doc.id), summary)
      } else {
        const map = await trackGeneration(doc.id, 'concepts', (s) => studyApi.generateConcepts(doc.id, s), signal)
        queryClient.setQueryData(qk.concepts(doc.id), map)
        if (current(session)) set({ graph: toKnowledgeGraph(map, doc.page_count) })
        // It forms here, on the dashboard; the document overview then shows it finished.
        markFormed(doc.id)
      }
      if (current(session)) dispatch({ type: 'stepDone', step })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Stopped (here or from the indicator): don't start the queued step; offer Retry for both.
        if (!current(session)) return
        generationAbort?.abort()
        for (const s of ['concepts', 'summary'] as const) {
          if (get().state.steps[s] === 'active') dispatch({ type: 'stepFailed', step: s, error: stoppedError() })
        }
        return
      }
      if (current(session)) dispatch({ type: 'stepFailed', step, error })
    }
  }

  const afterDocument = async (session: number, doc: DocumentDto) => {
    let latest = doc
    while (latest.status === 'processing' && current(session)) {
      await new Promise((r) => setTimeout(r, POLL_MS))
      latest = await documentsApi.get(doc.id)
      if (current(session)) dispatch({ type: 'document', document: latest })
    }
    queryClient.setQueryData(qk.document(latest.id), latest)
    // An older list request still in flight (e.g. the dashboard's first load) would overwrite the cache
    // with a list that predates this upload, so cancel it before writing the new document in.
    await queryClient.cancelQueries({ queryKey: qk.documents, exact: true })
    queryClient.setQueryData<DocumentDto[]>(qk.documents, (list) => [latest, ...(list ?? []).filter((d) => d.id !== latest.id)])
    refreshLists()
    if (latest.status !== 'ready' || !current(session)) return
    generationAbort = new AbortController()
    // Sequential, not parallel: a local model handles one request at a time. The concept map goes
    // first so the graph forms as early as possible.
    dispatch({ type: 'stepStarted', step: 'summary' })
    await runStep(session, latest, 'concepts')
    if (current(session) && !generationAbort.signal.aborted) await runStep(session, latest, 'summary')
  }

  return {
    state: initialUploadState,
    graph: null,
    rejection: null,

    bind: (input, navigate) => {
      fileInput = input
      navigateTo = navigate
    },

    pickFile: () => {
      prefetchCanvas()
      fileInput?.click()
    },

    start: (file) => {
      const problem = precheckFile(file)
      if (problem) {
        set({ rejection: problem })
        toast.error(problem)
        return
      }
      uploadAbort?.abort()
      generationAbort?.abort()
      uploadAbort = new AbortController()
      set({ graph: null, rejection: null })
      dispatch({ type: 'start', fileName: file.name, fileSize: file.size })
      const session = get().state.session
      prefetchCanvas()
      if (window.location.pathname !== '/') navigateTo?.('/')
      performance.mark('sp:upload-start')

      uploadDocument(
        file,
        {
          onProgress: (fraction) => current(session) && dispatch({ type: 'progress', fraction }),
          onUploaded: () => current(session) && dispatch({ type: 'uploaded' }),
        },
        uploadAbort.signal,
      )
        .then((doc) => {
          if (!current(session)) return
          dispatch({ type: 'document', document: doc })
          return afterDocument(session, doc)
        })
        .catch((error) => {
          if (!current(session)) return
          if (error instanceof Error && error.name === 'AbortError') return
          dispatch({ type: 'uploadFailed', error })
        })
    },

    cancel: () => {
      const { phase } = get().state
      if (phase === 'uploading' || phase === 'reading') {
        uploadAbort?.abort()
        dispatch({ type: 'cancelled' })
      } else if (phase === 'generating') {
        // Stops the model on the server too; the steps then show "Stopped" with Retry.
        generationAbort?.abort()
      }
    },

    retryRead: () => {
      const { document } = get().state
      if (!document) return
      // A new session that skips the byte upload: the server re-reads the file it already has.
      dispatch({ type: 'start', fileName: document.filename, fileSize: document.size_bytes })
      dispatch({ type: 'uploaded' })
      const session = get().state.session
      documentsApi
        .reprocess(document.id)
        .then((doc) => {
          if (!current(session)) return
          dispatch({ type: 'document', document: doc })
          return afterDocument(session, doc)
        })
        .catch((error) => current(session) && dispatch({ type: 'uploadFailed', error }))
    },

    retryStep: (step) => {
      const { document, session } = get().state
      if (!document) return
      generationAbort = new AbortController()
      void runStep(session, document, step)
    },

    reset: () => {
      uploadAbort?.abort()
      generationAbort?.abort()
      set({ graph: null, rejection: null })
      dispatch({ type: 'reset' })
    },
  }
})
