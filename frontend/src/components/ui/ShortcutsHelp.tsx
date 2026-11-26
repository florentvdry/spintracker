import { useTranslation } from 'react-i18next'
import Modal from '@/components/ui/Modal'
import { SHORTCUTS, type ShortcutScope } from '@/utils/shortcuts'

const KEY_LABELS: Record<string, string> = { ' ': 'Space', ArrowRight: '→', ArrowLeft: '←' }

/** The list of keyboard shortcuts, opened with `?`. */
export default function ShortcutsHelp({ open, onClose, scopes }: { open: boolean; onClose: () => void; scopes: ShortcutScope[] }) {
  const { t } = useTranslation()
  return (
    <Modal open={open} title={t('shortcuts.title')} onClose={onClose} width={440}>
      <div className="space-y-4">
        {scopes.map((scope) => (
          <section key={scope}>
            <h3 className="mb-1 text-[11px] uppercase tracking-[.06em] text-gray-500">{t(`shortcuts.scope_${scope}`)}</h3>
            <ul>
              {SHORTCUTS.filter((d) => d.scope === scope).map((d) => (
                <li key={d.id} className="flex items-center justify-between border-t border-[#1f242c] py-1.5 text-[13px] text-gray-200">
                  <span>{t(d.labelKey)}</span>
                  <span className="flex gap-1">
                    {d.keys.map((key, i) => (
                      <kbd key={i} className="rounded border border-dark-100 bg-dark-300 px-1.5 py-0.5 font-mono text-[11px] text-gray-100">{KEY_LABELS[key] ?? key}</kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  )
}
