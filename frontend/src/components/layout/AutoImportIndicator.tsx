import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { AUTO_IMPORT_ANCHOR } from '@/views/Settings/anchors'
import type { AutoImportState } from '@/services/ipcService'
import { useAutoImportStore } from '@/stores/autoImportStore'

const DOT_STYLE: Record<AutoImportState, string> = {
  off: 'bg-gray-600',
  watching: 'bg-profit-positive',
  importing: 'bg-primary-500 animate-pulse',
  paused: 'bg-yellow-500',
  error: 'bg-red-500',
}

/** Status light of the automatic import, shown next to the Import button. */
export default function AutoImportIndicator() {
  const { t } = useTranslation()
  const status = useAutoImportStore((s) => s.status)
  const label = t(`auto_import.state.${status.state}`)

  return (
    <Link
      to="/settings"
      state={{ focus: AUTO_IMPORT_ANCHOR }}
      className="flex items-center gap-2 rounded px-2 py-1 text-xs text-gray-400 hover:bg-dark-200 hover:text-gray-200"
      title={status.message ?? label}
    >
      <span className={clsx('h-2 w-2 rounded-full', DOT_STYLE[status.state])} />
      <span className="hidden xl:inline">{label}</span>
    </Link>
  )
}
