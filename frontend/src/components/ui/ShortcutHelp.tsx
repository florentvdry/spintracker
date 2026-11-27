import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import { SHORTCUTS } from '@/utils/shortcuts'

/** The list of keyboard shortcuts, opened with "?". */
export default function ShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Modal open={open} title={t('shortcuts.title')} onClose={onClose} width={420}>
      <ul className="space-y-2 text-sm">
        {SHORTCUTS.map((shortcut) => (
          <li key={shortcut.keys} className="flex items-center justify-between gap-4">
            <span className="text-gray-300">{t(shortcut.labelKey)}</span>
            <kbd className="rounded border border-dark-100 bg-dark-300 px-2 py-0.5 font-mono text-xs text-gray-100">{shortcut.keys}</kbd>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
