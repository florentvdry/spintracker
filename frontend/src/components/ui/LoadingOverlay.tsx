import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'

interface LoadingOverlayProps {
  loading: boolean
  className?: string
  children: ReactNode
}

/** Keeps the content in place and dims it under a spinner while `loading`, so stale values are never shown as current. */
export default function LoadingOverlay({ loading, className, children }: LoadingOverlayProps) {
  const { t } = useTranslation()
  return (
    <div className={clsx('relative', className)} aria-busy={loading}>
      <div className={clsx('transition-opacity', loading && 'pointer-events-none opacity-40')}>{children}</div>
      {loading && (
        <div role="status" aria-label={t('common.loading')} className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="spinner" />
        </div>
      )}
    </div>
  )
}
