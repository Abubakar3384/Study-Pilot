import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'
import type { GraphStore } from './graphStore'

/** Two-way sync between the selected concept and `?concept=` (deep links, back button, sharing). */
export function useConceptParam(store: GraphStore, knownIds: Set<string> | null) {
  const [params, setParams] = useSearchParams()
  const setParamsRef = useRef(setParams)
  useEffect(() => {
    setParamsRef.current = setParams
  }, [setParams])

  const fromUrl = params.get('concept')
  useEffect(() => {
    if (!knownIds) return
    const id = fromUrl && knownIds.has(fromUrl) ? fromUrl : null
    if (id && store.getState().selectedId !== id) store.getState().select(id)
  }, [fromUrl, knownIds, store])

  useEffect(
    () =>
      store.subscribe((s, prev) => {
        if (s.selectedId === prev.selectedId) return
        const next = new URLSearchParams(window.location.search)
        if (s.selectedId) next.set('concept', s.selectedId)
        else next.delete('concept')
        setParamsRef.current(next, { replace: true })
      }),
    [store],
  )
}
