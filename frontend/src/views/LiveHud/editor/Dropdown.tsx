import { useEffect, useRef, type ReactNode } from 'react'
import clsx from 'clsx'

interface Props {
  open: boolean
  onClose: () => void
  trigger: ReactNode
  align?: 'left' | 'right'
  children: ReactNode
}

/** A trigger and the panel under it; a press outside or Escape closes it. */
export default function Dropdown({ open, onClose, trigger, align = 'left', children }: Props) {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return (
    <div ref={root} className="relative">
      {trigger}
      {open && <div className={clsx('absolute top-full z-30 mt-1', align === 'right' ? 'right-0' : 'left-0')}>{children}</div>}
    </div>
  )
}
