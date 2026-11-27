import { useTranslation } from 'react-i18next'
import RangesSettings from '@/views/Settings/components/RangesSettings'
import { RANGES_ANCHOR } from '@/views/Settings/anchors'

export default function RangesPage() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4">
      <div id={RANGES_ANCHOR}>
        <h2 className="section-label mb-3">{t('ranges.settings.title')}</h2>
        <RangesSettings />
      </div>
    </div>
  )
}
