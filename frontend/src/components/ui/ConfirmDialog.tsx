import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

interface ConfirmDialogProps {
  open: boolean
  title: string
  detail?: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

/** Destructive-action confirmation, replacing the native Electron message box. */
export default function ConfirmDialog({ open, title, detail, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const { t } = useTranslation()
  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div className="bg-dark-300 rounded-lg p-6 w-[420px] shadow-xl border border-dark-200" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-100 mb-2">{title}</h3>
        {detail && <p className="text-sm text-gray-400 mb-6">{detail}</p>}
        <div className="flex justify-end gap-3">
          <button className="btn-secondary" autoFocus onClick={onCancel}>{t('common.cancel')}</button>
          <button className="btn-danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
