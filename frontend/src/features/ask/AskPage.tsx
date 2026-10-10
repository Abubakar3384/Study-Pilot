import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAiJob } from '../../data/generation'
import { appNavigate } from '../../app/navigator'
import { BusyNote, StopButton } from '../../app/GenerationIndicator'
import { toast } from '../../ui/toast'
import { m } from 'motion/react'
import { ArrowUp, MessageSquarePlus, SearchX } from 'lucide-react'
import { chatApi } from '../../api/endpoints/chat'
import { qk } from '../../api/queryKeys'
import type { MessageDto } from '../../api/types'
import { formatDate } from '../../data/format'
import { useKnowledgeGraph } from '../../data/hooks'
import { t } from '../../motion/variants'
import { IconButton } from '../../ui/Button'
import { ErrorNotice, Kbd, Skeleton } from '../../ui/Feedback'
import { PageRef } from '../../ui/PageRef'
import { RichBlocks } from '../../ui/RichText'
import { cn } from '../../ui/cn'
import { useDocumentContext } from '../document/context'
import '@fontsource-variable/source-serif-4/opsz.css'

const MAX = 4000

export default function AskPage() {
  const { doc } = useDocumentContext()
  const { conversationId } = useParams()
  const qc = useQueryClient()
  const list = useQuery({ queryKey: qk.conversations(doc.id), queryFn: ({ signal }) => chatApi.conversations(doc.id, signal) })
  const convo = useQuery({
    queryKey: qk.conversation(doc.id, conversationId ?? ''),
    queryFn: ({ signal }) => chatApi.conversation(doc.id, conversationId!, signal),
    enabled: !!conversationId,
  })
  const { graph } = useKnowledgeGraph(doc)
  const [draft, setDraft] = useState('')
  const bottom = useRef<HTMLDivElement>(null)

  // The question in flight lives in the app-wide job tracker, so leaving and coming back keeps it.
  const send = useAiJob(doc.id, 'chat', {
    run: (q: { text: string; conversationId?: string }, signal) => chatApi.send(doc.id, q.text, q.conversationId, signal),
    onSuccess: async (res, q, { stillHere }) => {
      // The thread is re-read from the server so it shows exactly what was stored.
      await qc.invalidateQueries({ queryKey: qk.conversation(doc.id, res.conversation_id) })
      void qc.invalidateQueries({ queryKey: qk.conversations(doc.id), exact: true })
      void qc.invalidateQueries({ queryKey: qk.activity })
      const path = `/d/${doc.id}/ask/${res.conversation_id}`
      if (stillHere) {
        if (!q.conversationId) appNavigate(path)
      } else {
        toast.info('Your answer is ready.', { label: 'Open', onClick: () => appNavigate(path) })
      }
    },
    // Nothing was saved when sending failed: give the question back.
    onError: (_e, q) => setDraft((d) => d || q.text),
    onStop: (q) => setDraft((d) => d || q.text),
  })
  // Only show the in-flight question (or its error) in the conversation it belongs to.
  const here = send.variables && send.variables.conversationId === conversationId
  const pending = send.isPending && here ? send.variables!.text : null
  const sendError = here ? send.error : undefined

  const messages: MessageDto[] = conversationId ? (convo.data?.messages ?? []) : []
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [messages.length, pending])

  const examples = useMemo(() => {
    const key = graph?.concepts.filter((c) => c.importance === 3) ?? []
    const out: string[] = []
    if (key[0]) out.push(`Explain ${key[0].title.toLowerCase()} in simple terms.`)
    if (key[0] && key[1]) out.push(`How is ${key[0].title.toLowerCase()} related to ${key[1].title.toLowerCase()}?`)
    if (key[2]) out.push(`What should I remember about ${key[2].title.toLowerCase()}?`)
    out.push('What are the main ideas of this document?')
    return out.slice(0, 4)
  }, [graph])

  const submit = (text = draft) => {
    const q = text.trim()
    if (!q || send.disabled) return
    setDraft('')
    send.mutate({ text: q.slice(0, MAX), conversationId })
  }

  return (
    <div className="mx-auto grid max-w-[1200px] gap-6 px-4 py-6 md:px-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside aria-label="Conversation history" className="lg:sticky lg:top-32 lg:self-start">
        <Link
          to={`/d/${doc.id}/ask`}
          className="mb-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-sm border border-line-strong text-base font-medium hover:border-signal hover:text-signal"
        >
          <MessageSquarePlus className="size-4" aria-hidden /> New conversation
        </Link>
        {list.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : list.data && list.data.length > 0 ? (
          <details open className="group">
            <summary className="eyebrow mb-1 cursor-pointer lg:pointer-events-none lg:list-none">History ({list.data.length})</summary>
            <ul className="flex flex-col">
              {list.data.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/d/${doc.id}/ask/${c.id}`}
                    aria-current={c.id === conversationId ? 'page' : undefined}
                    className={cn(
                      'block rounded-sm px-2 py-1.5 text-sm',
                      c.id === conversationId ? 'tint-signal text-text' : 'text-text-2 hover:bg-surface-2 hover:text-text',
                    )}
                  >
                    <span className="line-clamp-2">{c.title}</span>
                    <span className="font-mono text-[11px] text-text-3">{formatDate(c.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <p className="text-sm text-text-3">Your conversations about this document will be listed here.</p>
        )}
      </aside>

      <section aria-label="Conversation" className="flex min-h-[60vh] min-w-0 flex-col">
        <div className="flex-1">
          {conversationId && convo.isPending ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="ml-auto h-10 w-1/2" />
              <Skeleton className="h-24 w-4/5" />
            </div>
          ) : conversationId && convo.isError ? (
            <ErrorNotice error={convo.error} onRetry={() => convo.refetch()} />
          ) : messages.length === 0 && !pending ? (
            <div className="mx-auto max-w-xl py-8">
              <p className="eyebrow">Ask about this document</p>
              <h2 className="mt-2 text-xl font-semibold">Answers come only from these pages, with citations.</h2>
              <p className="mt-2 text-base text-text-2">If the document doesn’t cover something, you’ll be told so rather than given a guess.</p>
              <ul className="mt-5 flex flex-col gap-2">
                {examples.map((ex) => (
                  <li key={ex}>
                    <button
                      type="button"
                      onClick={() => submit(ex)}
                      className="w-full rounded-md border border-line px-3 py-2.5 text-left text-base text-text-2 transition-colors hover:border-signal hover:text-text"
                    >
                      {ex}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ol className="flex flex-col gap-6" aria-live="polite">
              {messages.map((msg) => (
                <Message key={msg.id} msg={msg} />
              ))}
              {pending && (
                <>
                  <Message msg={{ id: 'pending', role: 'user', content: pending, citations: [], created_at: '' }} />
                  <li className="flex items-center gap-3 text-base text-text-2" role="status">
                    <span className="flex gap-1" aria-hidden>
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="size-1.5 rounded-full bg-signal motion-safe:animate-pulse" style={{ animationDelay: `${i * 160}ms` }} />
                      ))}
                    </span>
                    Searching the document…
                    <StopButton onStop={send.stop} stopping={send.stopping} />
                  </li>
                </>
              )}
            </ol>
          )}
          {sendError ? <ErrorNotice className="mt-4" error={sendError} onRetry={() => submit(draft || send.variables?.text)} /> : null}
          <div ref={bottom} />
        </div>

        <form
          className="sticky bottom-16 mt-6 rounded-md border border-line-strong bg-surface-1 p-2 focus-within:border-signal md:bottom-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <label htmlFor="ask-input" className="sr-only">
            Your question
          </label>
          <div className="flex items-end gap-2">
            <textarea
              id="ask-input"
              value={draft}
              maxLength={MAX}
              rows={1}
              placeholder="Ask a question about this document"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              className="max-h-48 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-md placeholder:text-text-3 focus:outline-none [field-sizing:content]"
            />
            <IconButton type="submit" variant="primary" label="Send question" disabled={!draft.trim() || !!send.blockedBy} busy={send.isPending}>
              <ArrowUp className="size-4" />
            </IconButton>
          </div>
          <BusyNote job={send.blockedBy} className="px-2 pt-1 text-xs text-text-3" />
          <p className="flex justify-between px-2 pt-1 text-[11px] text-text-3">
            <span className="hidden sm:inline">
              <Kbd>Enter</Kbd> send · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> new line
            </span>
            {draft.length > MAX * 0.8 && <span className="font-mono tabular">{draft.length}/{MAX}</span>}
          </p>
        </form>
      </section>
    </div>
  )
}

function Message({ msg }: { msg: MessageDto }) {
  if (msg.role === 'user') {
    return (
      <m.li initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: t.enter }} className="flex justify-end">
        <p className="max-w-[80%] rounded-md bg-surface-2 px-4 py-2.5 text-md whitespace-pre-wrap">{msg.content}</p>
      </m.li>
    )
  }
  const notFound = msg.citations.length === 0
  return (
    <m.li initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: t.enter }} className="max-w-[68ch]">
      {notFound && (
        <p className="mb-1.5 flex items-center gap-1.5 text-sm text-amber">
          <SearchX className="size-4" aria-hidden /> Not found in this document
        </p>
      )}
      <div className={cn('reading', notFound && 'text-text-2')}>
        <RichBlocks text={msg.content} />
      </div>
      {!notFound && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="eyebrow mr-1">Sources</span>
          {msg.citations.map((c, i) => (
            <PageRef key={`${c.page_number}-${i}`} page={c.page_number} snippet={c.snippet} />
          ))}
        </div>
      )}
    </m.li>
  )
}
