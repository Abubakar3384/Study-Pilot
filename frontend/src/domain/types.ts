/**
 * Domain types the UI and the canvas depend on. API DTOs are mapped into these in api/mappers.ts,
 * so the visualisation never depends on the backend or on any AI provider.
 */

export type ConceptImportance = 1 | 2 | 3

export interface Concept {
  /** Stable identifier (slug); used for URLs, selection and object identity in the scene. */
  id: string
  title: string
  explanation?: string
  /** 1-based source pages, ascending, never empty. */
  pages: number[]
  /** 3 = key concept, 2 = supporting, 1 = detail. */
  importance: ConceptImportance
}

export type ConceptLinkKind = 'related' | 'prerequisite' | 'part_of'

export interface ConceptLink {
  source: string
  target: string
  kind: ConceptLinkKind
}

export interface KnowledgeGraph {
  documentId: string
  /** Changes whenever the concept set changes; layout and scene objects are keyed by it. */
  version: string
  pageCount: number
  concepts: Concept[]
  links: ConceptLink[]
  /** True for bundled example data, which must be labelled as such in the UI. */
  isExample?: boolean
  /** What built it, e.g. "mock" (keyword analysis, labelled in the UI) or "ollama". */
  generator?: string | null
}

/**
 * What the knowledge canvas should show. It mirrors real backend state only;
 * the canvas animates between these states but never invents progress.
 */
export type SceneInput =
  | { kind: 'empty' }
  /** A file was chosen and is uploading / being read by the server. */
  | { kind: 'ingesting' }
  /** The server read `pageCount` pages; `working` while generation requests are in flight. */
  | { kind: 'pages'; pageCount: number; working: boolean; failed?: boolean }
  /** Concepts are available. `animate` plays the formation sequence (first time only). */
  | { kind: 'graph'; graph: KnowledgeGraph; animate: boolean }
