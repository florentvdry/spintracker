import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  /** Shown on the right of the title row. */
  aside?: ReactNode
  /** Width in pixels. */
  width?: number
  footer?: ReactNode
  children: ReactNode
}

/** A centred dialog: Escape and a click on the backdrop close it, focus moves inside it. */
export default function Modal({ open, title, onClose, aside, width = 640, footer, children }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return undefined
    panel.current?.focus()
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width }}
        className="max-w-full max-h-[90vh] flex flex-col rounded-[14px] border border-dark-200 bg-dark-400 shadow-xl outline-none"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
          <h3 className="text-lg font-semibold text-gray-100">{title}</h3>
          {aside}
        </div>
        <div className="px-6 pb-4 overflow-y-auto">{children}</div>
        {footer && <div className="flex justify-end gap-3 px-6 py-4 border-t border-dark-200">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
