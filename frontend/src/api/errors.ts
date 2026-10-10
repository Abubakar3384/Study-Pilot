/** Error raised for any non-2xx response; mirrors the backend's {error: {code, message}} envelope. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }

  /** Worth retrying automatically or offering a Retry button for. */
  get retryable(): boolean {
    return this.status === 0 || this.status >= 500
  }
}

const FRIENDLY: Record<string, string> = {
  network_error: "Can't reach the StudyPilot server. Check that it's running and try again.",
  document_not_ready: 'This document is still being read, or reading it failed.',
  ai_unavailable: 'The AI service is not responding right now. Nothing was saved. Try again in a moment.',
  ai_not_configured:
    'The AI service rejected the server credentials. Ask whoever runs the server to check its configuration.',
  ai_invalid_output: "The AI returned something we couldn't verify against your document, so it wasn't saved. Try again.",
  internal_error: 'Something went wrong on the server.',
}

/** Server messages are already written for people in these cases. */
const SERVER_COPY = new Set(['invalid_request', 'invalid_pdf', 'file_too_large', 'not_found'])

/** Copy to show the user for any thrown value. */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (SERVER_COPY.has(err.code)) return err.message
    // Local-model problems come with an actionable server message ("start Ollama", "run ollama pull").
    if (err.code === 'ai_unavailable' && /ollama/i.test(err.message)) return err.message.replace(/^.*?(?:rejected the request|attempts): /, '')
    return FRIENDLY[err.code] ?? err.message
  }
  if (err instanceof Error && err.name === 'AbortError') return 'Cancelled.'
  return 'Something went wrong.'
}
