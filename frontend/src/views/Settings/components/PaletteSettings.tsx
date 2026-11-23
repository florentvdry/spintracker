import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import Card from '@/components/ui/Card'
import { usePaletteStore } from '@/stores/paletteStore'
import { PALETTE_NAMES, PALETTES } from '@/utils/palette'

/** Global colour palette: the default one, or one that colour-blind players can tell apart. */
export default function PaletteSettings() {
  const { t } = useTranslation()
  const name = usePaletteStore((s) => s.name)
  const setName = usePaletteStore((s) => s.setName)

  return (
    <Card title={t('settings.palette.title')} subtitle={t('settings.palette.subtitle')}>
      <div className="flex flex-wrap gap-3">
        {PALETTE_NAMES.map((choice) => {
          const palette = PALETTES[choice]
          return (
            <button
              key={choice}
              aria-pressed={name === choice}
              onClick={() => setName(choice)}
              className={clsx('flex flex-col gap-2 rounded-lg border px-4 py-3 text-left', name === choice ? 'border-primary-500 bg-primary-500/10' : 'border-dark-200 hover:border-dark-100')}
            >
              <span className="text-sm font-semibold text-gray-100">{t(`settings.palette.${choice}`)}</span>
              <span className="flex gap-1.5" aria-hidden="true">
                {[palette.positive, palette.negative, palette.deviation, palette.respect.ok, palette.poolBelow].map((color) => (
                  <span key={color} className="h-4 w-4 rounded-[4px]" style={{ backgroundColor: color }} />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}
