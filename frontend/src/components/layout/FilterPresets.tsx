import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFilterStore } from '@/stores/filterStore'

/** Named sets of filters: apply one, save the current filters as a new one, or delete one. */
export default function FilterPresets() {
  const { t } = useTranslation()
  const presets = useFilterStore((s) => s.presets)
  const savePreset = useFilterStore((s) => s.savePreset)
  const applyPreset = useFilterStore((s) => s.applyPreset)
  const deletePreset = useFilterStore((s) => s.deletePreset)
  const [name, setName] = useState('')

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <select aria-label={t('filters.presets.apply')} className="rounded bg-dark-300 px-2 py-1 text-gray-200" value="" onChange={(event) => event.target.value && applyPreset(event.target.value)}>
        <option value="">{t('filters.presets.apply')}</option>
        {presets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.name}
          </option>
        ))}
      </select>
      <input
        className="w-36 rounded bg-dark-300 px-2 py-1 text-gray-100"
        placeholder={t('filters.presets.name')}
        aria-label={t('filters.presets.name')}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && savePreset(name)) setName('')
        }}
      />
      <button type="button" className="rounded bg-dark-300 px-2 py-1 text-gray-200 hover:text-gray-100" onClick={() => savePreset(name) && setName('')}>
        {t('filters.presets.save')}
      </button>
      {presets.length > 0 && (
        <select aria-label={t('filters.presets.delete')} className="rounded bg-dark-300 px-2 py-1 text-gray-400" value="" onChange={(event) => event.target.value && deletePreset(event.target.value)}>
          <option value="">{t('filters.presets.delete')}</option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
