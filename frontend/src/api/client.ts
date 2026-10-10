import { ApiError } from './errors'

export const API_BASE = '/api'

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: object | FormData
  signal?: AbortSignal
}

/** Parses the error envelope; falls back gracefully for proxies or HTML error pages. */
export async function toApiError(res: Response): Promise<ApiError> {
  try {
    const data = (await res.json()) as { error?: { code?: string; message?: string } }
    if (data?.error?.code) return new ApiError(res.status, data.error.code, data.error.message ?? res.statusText)
  } catch {
    // not JSON
  }
  const code = res.status >= 500 ? 'internal_error' : 'http_error'
  return new ApiError(res.status, code, res.statusText || 'Request failed')
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = opts
  const isForm = body instanceof FormData
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      signal,
      headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err
    throw new ApiError(0, 'network_error', 'Network request failed')
  }
  if (!res.ok) throw await toApiError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
