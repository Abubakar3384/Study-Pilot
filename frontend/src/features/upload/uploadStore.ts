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
      if (step === 'summary') {
        const summary = await studyApi.generateSummary(doc.id, signal)
        queryClient.setQueryData(qk.summary(doc.id), summary)
      } else {
        const map = await studyApi.generateConcepts(doc.id, signal)
        queryClient.setQueryData(qk.concepts(doc.id), map)
        if (current(session)) set({ graph: toKnowledgeGraph(map, doc.page_count) })
        // It forms here, on the dashboard; the document overview then shows it finished.
        markFormed(doc.id)
      }
      if (current(session)) dispatch({ type: 'stepDone', step })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
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
    // Put the new document in the cached list directly (newest first); the refetch is only a backstop.
    queryClient.setQueryData<DocumentDto[]>(qk.documents, (list) => (list ? [latest, ...list.filter((d) => d.id !== latest.id)] : list))
    refreshLists()
    if (latest.status !== 'ready' || !current(session)) return
    generationAbort = new AbortController()
    void runStep(session, latest, 'summary')
    void runStep(session, latest, 'concepts')
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
        generationAbort?.abort()
        dispatch({ type: 'stopWaiting' })
        toast.info('Stopped waiting. If the server finishes, the results will appear in the document.')
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
