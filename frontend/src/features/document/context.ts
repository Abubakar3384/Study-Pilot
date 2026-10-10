import { useOutletContext } from 'react-router'
import type { DocumentDto } from '../../api/types'
import type { GraphStore } from '../../graph/graphStore'

export interface DocumentContext {
  doc: DocumentDto
  /** Per-document graph UI state, shared by every tab (e.g. the concept you came from). */
  store: GraphStore
}

export function useDocumentContext() {
  return useOutletContext<DocumentContext>()
}
