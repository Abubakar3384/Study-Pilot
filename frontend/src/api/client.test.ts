import { api } from './client'
import { ApiError, describeError } from './errors'

function mockFetch(status: number, body: unknown, statusText = '') {
  const payload = typeof body === 'string' || body === undefined ? (body ?? null) : JSON.stringify(body)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(payload, { status, statusText })))
}

afterEach(() => vi.unstubAllGlobals())

describe('api client', () => {
  it('returns parsed JSON on success', async () => {
    mockFetch(200, { items: [] })
    await expect(api('/documents')).resolves.toEqual({ items: [] })
  })

  it('maps the error envelope to ApiError', async () => {
    mockFetch(409, { error: { code: 'document_not_ready', message: 'Document is failed' } })
    const err = await api('/documents/x/summary', { method: 'POST' }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 409, code: 'document_not_ready', retryable: false })
  })

  it('handles non-JSON 5xx bodies', async () => {
    mockFetch(502, '<html>', 'Bad Gateway')
    const err = await api('/x').catch((e) => e)
    expect(err).toMatchObject({ status: 502, code: 'internal_error', retryable: true })
  })

  it('turns network failures into a retryable network_error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    const err = await api('/x').catch((e) => e)
    expect(err).toMatchObject({ status: 0, code: 'network_error', retryable: true })
  })

  it('resolves undefined for 204', async () => {
    mockFetch(204, undefined)
    await expect(api('/documents/x', { method: 'DELETE' })).resolves.toBeUndefined()
  })
})

describe('describeError', () => {
  it('prefers friendly copy for AI failures and server copy for validation', () => {
    expect(describeError(new ApiError(503, 'ai_unavailable', 'raw'))).toMatch(/not responding/)
    expect(describeError(new ApiError(422, 'invalid_pdf', 'The uploaded file is not a PDF.'))).toBe(
      'The uploaded file is not a PDF.',
    )
  })

  it('passes through actionable Ollama messages without the runner prefix', () => {
    const missing = new ApiError(503, 'ai_unavailable', "The AI provider rejected the request: Ollama has no model 'llama3.1:8b'. Run `ollama pull llama3.1:8b` first.")
    expect(describeError(missing)).toBe("Ollama has no model 'llama3.1:8b'. Run `ollama pull llama3.1:8b` first.")
    const down = new ApiError(503, 'ai_unavailable', 'AI provider failed after 3 attempts: Ollama is not reachable at http://localhost:11434. Start it.')
    expect(describeError(down)).toMatch(/^Ollama is not reachable/)
  })
})
