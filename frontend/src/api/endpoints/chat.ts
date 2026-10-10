import { api } from '../client'
import type { ChatResponseDto, ConversationDto, ConversationSummaryDto } from '../types'

export const chatApi = {
  send: (docId: string, message: string, conversationId?: string) =>
    api<ChatResponseDto>(`/documents/${docId}/chat`, {
      method: 'POST',
      body: { message, conversation_id: conversationId ?? null },
    }),
  conversations: (docId: string, signal?: AbortSignal) =>
    api<{ items: ConversationSummaryDto[] }>(`/documents/${docId}/conversations`, { signal }).then((r) => r.items),
  conversation: (docId: string, cid: string, signal?: AbortSignal) =>
    api<ConversationDto>(`/documents/${docId}/conversations/${cid}`, { signal }),
}
