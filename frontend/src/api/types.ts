/** Friendly aliases for the generated OpenAPI schema (run `npm run gen:api` after backend changes). */
import type { components } from './schema.gen'

type S = components['schemas']

export type DocumentDto = S['DocumentOut']
export type PageDto = S['PageOut']
export type SummaryDto = S['SummaryOut']
export type NotesDto = S['NotesOut']
export type NoteSectionDto = S['NoteSection']
export type QuizDto = S['QuizOut']
export type QuizQuestionDto = S['QuizQuestionOut']
export type AttemptDto = S['AttemptOut']
export type QuestionResultDto = S['QuestionResultOut']
export type AnswerIn = S['AnswerIn']
export type FlashcardDto = S['FlashcardOut']
export type ReviewRating = S['ReviewCreate']['rating']
export type MessageDto = S['MessageOut']
export type CitationDto = S['Citation']
export type ConversationSummaryDto = S['ConversationSummaryOut']
export type ConversationDto = S['ConversationOut']
export type ChatResponseDto = S['ChatResponse']

export type DocumentStatus = DocumentDto['status']
export type NotesEditDto = S['NotesEdit']
export type ConceptMapDto = S['ConceptMapOut']
export type AnswerCheckDto = S['AnswerCheckOut']
export type ActivityItemDto = S['ActivityItem']
export type ActivityType = ActivityItemDto['type']

