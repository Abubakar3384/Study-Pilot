import { useMemo } from 'react'
import type { SceneInput } from '../domain/types'

/** Identity of a scene input: only the fields that change what the canvas shows. */
export function sceneInputKey(input: SceneInput): string {
  switch (input.kind) {
    case 'empty':
    case 'ingesting':
      return input.kind
    case 'pages':
      return `pages:${input.pageCount}:${input.working}:${!!input.failed}`
    case 'graph':
      return `graph:${input.graph.documentId}:${input.graph.version}:${input.animate}`
  }
}

/**
 * Callers rebuild SceneInput objects freely (e.g. on every upload-progress tick); this keeps the
 * same object while nothing visible changed, so the canvas neither re-renders nor restarts timing.
 */
export function useStableSceneInput(input: SceneInput): SceneInput {
  const key = sceneInputKey(input)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => input, [key])
}
