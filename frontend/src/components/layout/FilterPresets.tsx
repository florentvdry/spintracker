import { useState } from 'react'
import { Bookmark, ChevronDown, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { useFilterPresetsStore } from '@/stores/filterPresetsStore'

/** Saved filter sets: named, applied in one click. */
export default function FilterPresets() {
  const { t } = useTranslation()
  const presets = useFilterPresetsStore((s) => s.presets)
  const { saveCurrent, apply, remove } = useFilterPresetsStore.getState()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [refused, setRefused] = useState(false)

  const save = () => {
    const saved = saveCurrent(name)
    setRefused(!saved)
    if (saved) setName('')
  }

  return (
    <div className="relative">
      <button type="button" className={clsx('pill', open && 'active')} onClick={() => setOpen(!open)}>
        <Bookmark className="h-3.5 w-3.5" /> {t('presets.title')} <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1.5 flex w-72 flex-col rounded-[10px] border border-dark-200 bg-dark-300 p-2 shadow-xl">
            {presets.length === 0 && <p className="px-2 py-3 text-center text-xs text-gray-500">{t('presets.none')}</p>}
            {presets.map((preset) => (
              <div key={preset.id} className="group flex items-center rounded-md hover:bg-dark-400">
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm text-gray-200"
                  onClick={() => {
                    apply(preset.id)
                    setOpen(false)
                  }}
                >
                  {preset.name}
                </button>
                <button type="button" className="p-1.5 text-gray-500 opacity-0 hover:text-profit-negative group-hover:opacity-100" aria-label={t('common.delete')} onClick={() => remove(preset.id)}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <div className="mt-2 flex gap-1.5 border-t border-dark-200 pt-2">
              <input
                className="input min-w-0 flex-1 text-xs"
                placeholder={t('presets.name_placeholder')}
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setRefused(false)
                }}
                onKeyDown={(e) => e.key === 'Enter' && save()}
              />
              <button type="button" className="btn-secondary text-xs" onClick={save}>
                {t('presets.save')}
              </button>
            </div>
            {refused && <p className="px-1 pt-1.5 text-[11px] text-profit-negative">{t('presets.refused')}</p>}
            <p className="px-1 pt-1.5 text-[11px] text-gray-500">{t('presets.hint')}</p>
          </div>
        </>
      )}
    </div>
  )
}
