import type { DocumentDto } from '../api/types'
import { sampleGraph } from '../fixtures/sample-graph'
import { initialUploadState, sceneInputFor, uploadReducer, type UploadEvent, type UploadState } from './uploadPipeline'

const doc = (over: Partial<DocumentDto> = {}): DocumentDto => ({
  id: 'd1',
  filename: 'bio.pdf',
  size_bytes: 1000,
  status: 'ready',
  error: null,
  page_count: 12,
  starred: false,
  created_at: '2026-10-10T10:00:00Z',
  updated_at: '2026-10-10T10:00:00Z',
  ...over,
})

const run = (...events: UploadEvent[]) => events.reduce(uploadReducer, initialUploadState as UploadState)
const start: UploadEvent = { type: 'start', fileName: 'bio.pdf', fileSize: 1000 }

describe('uploadReducer', () => {
  it('reports real byte progress and never goes backwards', () => {
    const s = run(start, { type: 'progress', fraction: 0.6 }, { type: 'progress', fraction: 0.4 })
    expect(s.phase).toBe('uploading')
    expect(s.progress).toBe(0.6)
    expect(sceneInputFor(s, null)).toEqual({ kind: 'ingesting' })
  })

  it('switches to an indeterminate reading step once bytes are sent', () => {
    const s = run(start, { type: 'uploaded' })
    expect(s.phase).toBe('reading')
    expect(s.steps).toMatchObject({ upload: 'done', read: 'active' })
  })

  it('shows the real page count while generation runs', () => {
    const s = run(start, { type: 'uploaded' }, { type: 'document', document: doc() }, { type: 'stepStarted', step: 'summary' }, { type: 'stepStarted', step: 'concepts' })
    expect(s.phase).toBe('generating')
    expect(sceneInputFor(s, null)).toEqual({ kind: 'pages', pageCount: 12, working: true, failed: false })
  })

  it('only animates the graph once concepts really arrived', () => {
    let s = run(start, { type: 'document', document: doc() }, { type: 'stepStarted', step: 'summary' }, { type: 'stepStarted', step: 'concepts' })
    s = uploadReducer(s, { type: 'stepDone', step: 'summary' })
    expect(s.phase).toBe('generating')
    expect(sceneInputFor(s, sampleGraph).kind).toBe('pages')
    s = uploadReducer(s, { type: 'stepDone', step: 'concepts' })
    expect(s.phase).toBe('ready')
    expect(sceneInputFor(s, sampleGraph)).toMatchObject({ kind: 'graph', animate: true })
  })

  it('keeps a usable document when one generation step fails, with the error for retry', () => {
    let s = run(start, { type: 'document', document: doc() }, { type: 'stepStarted', step: 'summary' }, { type: 'stepStarted', step: 'concepts' })
    s = uploadReducer(s, { type: 'stepFailed', step: 'concepts', error: new Error('503') })
    s = uploadReducer(s, { type: 'stepDone', step: 'summary' })
    expect(s.phase).toBe('ready')
    expect(s.errors.concepts).toBeInstanceOf(Error)
    expect(sceneInputFor(s, null)).toEqual({ kind: 'pages', pageCount: 12, working: false, failed: true })
    s = uploadReducer(s, { type: 'stepStarted', step: 'concepts' })
    expect(s.errors.concepts).toBeUndefined()
    expect(s.phase).toBe('generating')
  })

  it('marks unreadable PDFs as a failed read with the server message', () => {
    const s = run(start, { type: 'uploaded' }, { type: 'document', document: doc({ status: 'failed', error: 'PDF is password-protected', page_count: 0 }) })
    expect(s.phase).toBe('failed')
    expect(s.steps.read).toBe('failed')
    expect(s.errors.read).toBe('PDF is password-protected')
  })

  it('attributes network errors to the step that was running', () => {
    expect(run(start, { type: 'uploadFailed', error: 'x' }).steps.upload).toBe('failed')
    expect(run(start, { type: 'uploaded' }, { type: 'uploadFailed', error: 'x' }).steps.read).toBe('failed')
  })

  it('stops the working signal when the user stops waiting, without claiming completion', () => {
    let s = run(start, { type: 'document', document: doc() }, { type: 'stepStarted', step: 'concepts' })
    s = uploadReducer(s, { type: 'stopWaiting' })
    expect(s.steps.concepts).toBe('active')
    expect(sceneInputFor(s, null)).toMatchObject({ working: false })
  })

  it('starts each upload as a new session', () => {
    const a = run(start)
    const b = uploadReducer(a, start)
    expect(b.session).toBe(a.session + 1)
    expect(uploadReducer(b, { type: 'cancelled' }).phase).toBe('cancelled')
  })
})
