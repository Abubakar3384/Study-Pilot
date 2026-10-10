import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { activityApi } from '../api/endpoints/activity'
import { documentsApi } from '../api/endpoints/documents'
import { studyApi } from '../api/endpoints/study'
import { ApiError, describeError } from '../api/errors'
import { toKnowledgeGraph } from '../api/mappers'
import { qk } from '../api/queryKeys'
import type { DocumentDto } from '../api/types'
import { toast } from '../ui/toast'

/** Generated resources answer 404 until generated: that is "not yet", not an error. */
async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

export function useDocuments() {
  return useQuery({ queryKey: qk.documents, queryFn: ({ signal }) => documentsApi.list(signal) })
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: qk.document(id),
    queryFn: ({ signal }) => documentsApi.get(id, signal),
    // The backend is the source of truth for status; poll only while it says "processing".
    refetchInterval: (q) => (q.state.data?.status === 'processing' ? 1500 : false),
  })
}

export function useSummary(id: string, enabled = true) {
  return useQuery({ queryKey: qk.summary(id), queryFn: ({ signal }) => orNull(studyApi.summary(id, signal)), enabled })
}

export function useNotes(id: string, enabled = true) {
  return useQuery({ queryKey: qk.notes(id), queryFn: ({ signal }) => orNull(studyApi.notes(id, signal)), enabled })
}

export function useConceptMap(id: string, enabled = true) {
  return useQuery({ queryKey: qk.concepts(id), queryFn: ({ signal }) => orNull(studyApi.concepts(id, signal)), enabled })
}

/** Concept map as a domain graph; referentially stable while the map's id is unchanged. */
export function useKnowledgeGraph(doc: DocumentDto | undefined) {
  const map = useConceptMap(doc?.id ?? '', !!doc && doc.status === 'ready')
  const graph = useMemo(
    () => (map.data && doc ? toKnowledgeGraph(map.data, doc.page_count) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map.data?.id, doc?.page_count],
  )
  return { ...map, graph }
}

export function useActivity(limit = 20) {
  // Activity changes from every study tool, so screens that show it always refresh on mount.
  return useQuery({
    queryKey: [...qk.activity, limit],
    queryFn: ({ signal }) => activityApi.recent(limit, signal),
    refetchOnMount: 'always',
  })
}

/** Due-card counts for several documents (one small request each, cached). */
export function useDueCounts(docs: DocumentDto[]) {
  const results = useQueries({
    queries: docs.map((d) => ({
      queryKey: qk.flashcards(d.id, true),
      queryFn: ({ signal }: { signal: AbortSignal }) => studyApi.flashcards(d.id, true, signal),
      staleTime: 60_000,
    })),
  })
  return docs.map((d, i) => ({ doc: d, due: results[i]?.data?.length ?? 0, loaded: !!results[i]?.data }))
}

export function useStarMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (doc: DocumentDto) => (doc.starred ? documentsApi.unstar(doc.id) : documentsApi.star(doc.id)),
    onMutate: async (doc) => {
      // Optimistic: flip immediately, roll back on error.
      await qc.cancelQueries({ queryKey: qk.documents, exact: true })
      const prev = qc.getQueryData<DocumentDto[]>(qk.documents)
      const flip = (d: DocumentDto) => (d.id === doc.id ? { ...d, starred: !doc.starred } : d)
      qc.setQueryData<DocumentDto[]>(qk.documents, (list) => list?.map(flip))
      qc.setQueryData<DocumentDto>(qk.document(doc.id), (d) => (d ? flip(d) : d))
      return { prev }
    },
    onError: (err, doc, ctx) => {
      qc.setQueryData(qk.documents, ctx?.prev)
      qc.setQueryData<DocumentDto>(qk.document(doc.id), (d) => (d ? { ...d, starred: doc.starred } : d))
      toast.error(describeError(err))
    },
    onSuccess: (updated) => {
      qc.setQueryData(qk.document(updated.id), updated)
    },
  })
}
