import { API_BASE, api } from '../client'
import type { DocumentDto, PageDto } from '../types'

export const documentsApi = {
  list: (signal?: AbortSignal) =>
    api<{ items: DocumentDto[] }>('/documents', { signal }).then((r) => r.items),
  get: (id: string, signal?: AbortSignal) => api<DocumentDto>(`/documents/${id}`, { signal }),
  remove: (id: string) => api<void>(`/documents/${id}`, { method: 'DELETE' }),
  reprocess: (id: string) => api<DocumentDto>(`/documents/${id}/reprocess`, { method: 'POST' }),
  page: (id: string, n: number, signal?: AbortSignal) =>
    api<PageDto>(`/documents/${id}/pages/${n}`, { signal }),
  star: (id: string) => api<DocumentDto>(`/documents/${id}/star`, { method: 'PUT' }),
  unstar: (id: string) => api<DocumentDto>(`/documents/${id}/star`, { method: 'DELETE' }),
  /** URL of the original PDF, for the browser's own viewer. */
  fileUrl: (id: string, page?: number) =>
    `${API_BASE}/documents/${id}/file${page ? `#page=${page}` : ''}`,
}
