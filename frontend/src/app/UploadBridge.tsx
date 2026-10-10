import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, m } from 'motion/react'
import { FileUp } from 'lucide-react'
import { useUpload } from '../features/upload/uploadStore'
import { prefetchCanvas } from '../graph/loadCanvas'
import { t } from '../motion/variants'
import { bindNavigator } from './navigator'

const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')

/**
 * Hosts the hidden file input used by every Upload button, and a drop target covering the whole app
 * (drag a PDF anywhere). Dropping or choosing a file starts the upload pipeline on the dashboard.
 */
export function UploadBridge() {
  const input = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const start = useUpload((s) => s.start)
  const bind = useUpload((s) => s.bind)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    bind(input.current, navigate)
    bindNavigator(navigate)
    return () => {
      bind(null, null)
      bindNavigator(null)
    }
  }, [bind, navigate])

  useEffect(() => {
    let depth = 0
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
      prefetchCanvas()
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      const file = e.dataTransfer?.files[0]
      if (file) start(file)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [start])

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) start(file)
        }}
      />
      <AnimatePresence>
        {dragging && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: t.fast }}
            exit={{ opacity: 0, transition: t.exit }}
            className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-ink/85 p-6"
          >
            <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-md border-2 border-dashed border-signal p-10 text-center">
              <FileUp className="size-8 text-signal" aria-hidden />
              <p className="text-lg font-semibold">Drop your PDF to start</p>
              <p className="text-base text-text-2">It uploads, is read page by page, then becomes a concept map.</p>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  )
}
