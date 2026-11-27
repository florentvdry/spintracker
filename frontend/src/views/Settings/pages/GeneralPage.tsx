import { Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { setLanguage } from '@/i18n'
import Card from '@/components/ui/Card'
import SettingRow from '@/views/Settings/components/SettingRow'

export default function GeneralPage() {
  const { t, i18n } = useTranslation()

  const languageButton = (code: string, label: string) => (
    <button
      onClick={() => setLanguage(code)}
      className={clsx('segmented-item', i18n.language.startsWith(code) && 'active')}
    >
      {label}
    </button>
  )

  return (
    <Card title={t('settings.general.title')}>
      <SettingRow icon={Globe} title={t('settings.general.language')} description={t('settings.general.language_desc')}>
        <div className="segmented">
          {languageButton('en', 'English')}
          {languageButton('fr', 'Français')}
        </div>
      </SettingRow>
    </Card>
  )
}
