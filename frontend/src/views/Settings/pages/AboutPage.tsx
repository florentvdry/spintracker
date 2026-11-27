import { FolderOpen, RefreshCw, Loader } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Card from '@/components/ui/Card'
import SettingRow from '@/views/Settings/components/SettingRow'

interface AboutPageProps {
  appVersion: string
  isChecking: boolean
  handleOpenLogs: () => Promise<void>
  checkForUpdates: () => void
}

export default function AboutPage({ appVersion, isChecking, handleOpenLogs, checkForUpdates }: AboutPageProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <Card title={t('settings.maintenance.title')}>
        <SettingRow icon={FolderOpen} title={t('settings.maintenance.logs.title')} description={t('settings.maintenance.logs.desc')}>
          <button onClick={() => void handleOpenLogs()} className="btn-secondary flex items-center gap-2">
            <FolderOpen className="w-4 h-4" />
            {t('settings.maintenance.logs.button')}
          </button>
        </SettingRow>
      </Card>

      <Card title={t('settings.about.title')}>
        <div className="space-y-4">
          <div className="text-sm text-gray-400">
            <p>
              <span className="text-gray-100">SpinTracker</span> v{appVersion}
            </p>
            <p>{t('settings.about.description')}</p>
          </div>
          <button onClick={() => void checkForUpdates()} className="btn-secondary flex items-center gap-2 text-sm">
            {isChecking ? <Loader className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {isChecking ? t('common.checking') : t('settings.about.check_updates')}
          </button>
        </div>
      </Card>
    </div>
  )
}
