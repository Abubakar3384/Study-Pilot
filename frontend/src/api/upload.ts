import { API_BASE } from './client'
import { ApiError } from './errors'
import type { DocumentDto } from './types'

/**
 * Upload with real byte progress. fetch() cannot report upload progress, so this uses XHR.
 * `onUploaded` fires when the last byte has been sent: from then on the server is reading the PDF,
 * which the UI shows as an indeterminate step because the server reports no finer progress.
 */
export function uploadDocument(
  file: File,
  handlers: { onProgress: (fraction: number) => void; onUploaded: () => void },
  signal: AbortSignal,
): Promise<DocumentDto> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}/documents`)
    xhr.responseType = 'json'
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) handlers.onProgress(e.loaded / e.total)
    }
    xhr.upload.onload = () => handlers.onUploaded()
    xhr.onload = () => {
      const body = xhr.response as { error?: { code: string; message: string } } | DocumentDto | null
      if (xhr.status >= 200 && xhr.status < 300 && body) return resolve(body as DocumentDto)
      const err = (body as { error?: { code: string; message: string } } | null)?.error
      reject(
        new ApiError(
          xhr.status,
          err?.code ?? (xhr.status >= 500 ? 'internal_error' : 'http_error'),
          err?.message ?? 'Upload failed',
        ),
      )
    }
    xhr.onerror = () => reject(new ApiError(0, 'network_error', 'Network request failed'))
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))
    signal.addEventListener('abort', () => xhr.abort(), { once: true })

    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
}

/** Matches the server's MAX_UPLOAD_MB (4 MB on Vercel, whose functions accept at most 4.5 MB). */
export const MAX_UPLOAD_MB = Number(import.meta.env.VITE_MAX_UPLOAD_MB) || 25

/** Fast client-side checks; the server re-validates everything (signature, size, readability). */
export function precheckFile(file: File): string | null {
  const looksPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!looksPdf) return `“${file.name}” is not a PDF. StudyPilot reads PDF files only.`
  if (file.size === 0) return `“${file.name}” is empty.`
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    return `“${file.name}” is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_UPLOAD_MB} MB.`
  }
  return null
}
