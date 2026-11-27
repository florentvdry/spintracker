import { Database, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import Card from '@/components/ui/Card'
import SettingRow from '@/views/Settings/components/SettingRow'

interface ServerPageProps {
  serverActive: boolean | null
  checkStatus: () => Promise<void>
}

export default function ServerPage({ serverActive, checkStatus }: ServerPageProps) {
  const { t } = useTranslation()

  return (
    <Card title={t('settings.server.title')} subtitle={t('settings.server.subtitle')}>
      <SettingRow
        icon={Database}
        title={t('settings.server.status.title')}
        description={t('settings.server.status.desc')}
      >
        <div className="flex items-center gap-2">
          <span className={clsx('badge', serverActive ? 'badge-success' : 'badge-danger')}>
            {serverActive ? t('settings.server.status.active') : t('settings.server.status.inactive')}
          </span>
          <button onClick={() => void checkStatus()} className="btn-secondary flex items-center gap-2 text-sm">
            <RefreshCw className="w-4 h-4" />
            {t('common.refresh')}
          </button>
        </div>
      </SettingRow>
    </Card>
  )
}
