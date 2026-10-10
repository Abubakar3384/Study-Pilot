import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { documentsApi } from '../../api/endpoints/documents'
import { qk } from '../../api/queryKeys'
import type { DocumentDto } from '../../api/types'
import { documentTitle } from '../../data/format'
import { Button, IconButton } from '../../ui/Button'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { toast } from '../../ui/toast'

/** Deletes a document and everything generated from it, after an explicit confirmation. */
export function useDeleteDocument(onDeleted?: () => void) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (doc: DocumentDto) => documentsApi.remove(doc.id),
    onSuccess: (_void, doc) => {
      qc.setQueryData<DocumentDto[]>(qk.documents, (list) => list?.filter((d) => d.id !== doc.id))
      qc.removeQueries({ queryKey: ['documents', doc.id] })
      void qc.invalidateQueries({ queryKey: qk.documents, exact: true })
      void qc.invalidateQueries({ queryKey: qk.activity })
      try {
        localStorage.removeItem(`sp:formed:${doc.id}`)
      } catch {
        // nothing to clean up
      }
      toast.success(`Deleted “${documentTitle(doc)}”`)
      onDeleted?.()
    },
  })
}

export function DeleteDocumentButton({
  doc,
  variant = 'icon',
  onDeleted,
}: {
  doc: DocumentDto
  variant?: 'icon' | 'button'
  onDeleted?: () => void
}) {
  const [open, setOpen] = useState(false)
  const remove = useDeleteDocument(() => {
    setOpen(false)
    onDeleted?.()
  })
  const title = documentTitle(doc)
  const show = () => {
    remove.reset()
    setOpen(true)
  }

  return (
    <>
      {variant === 'icon' ? (
        <IconButton label={`Delete ${title}`} size="sm" onClick={show} className="text-text-3 hover:text-incorrect">
          <Trash2 className="size-4" />
        </IconButton>
      ) : (
        <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={show} className="hover:text-incorrect">
          Delete
        </Button>
      )}
      <ConfirmDialog
        open={open}
        title="Delete this document?"
        body={
          <>
            <span className="font-medium text-text">{title}</span> and everything made from it (summary, notes,
            concept map, quizzes and results, flashcards and conversations) will be permanently deleted. This
            can’t be undone.
          </>
        }
        confirmLabel="Delete document"
        busy={remove.isPending}
        error={remove.error}
        onConfirm={() => remove.mutate(doc)}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}
