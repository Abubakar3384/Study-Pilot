import type { ConceptImportance, KnowledgeGraph } from '../domain/types'
import type { ConceptMapDto } from './types'

/** Backend concept map → the domain graph the canvas understands. */
export function toKnowledgeGraph(dto: ConceptMapDto, pageCount: number): KnowledgeGraph {
  return {
    documentId: dto.document_id,
    version: dto.id,
    pageCount: Math.max(pageCount, ...dto.concepts.flatMap((c) => c.page_numbers)),
    concepts: dto.concepts.map((c) => ({
      id: c.id,
      title: c.title,
      explanation: c.explanation,
      pages: [...c.page_numbers].sort((a, b) => a - b),
      importance: Math.min(3, Math.max(1, c.importance)) as ConceptImportance,
    })),
    links: dto.relations.map((r) => ({ source: r.source, target: r.target, kind: r.kind ?? 'related' })),
    generator: dto.generator ?? null,
  }
}
