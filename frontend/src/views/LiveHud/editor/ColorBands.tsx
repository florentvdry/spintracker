import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { hudBaselines } from '@/views/Stats/hudText'
import { baselineBands, effectiveBands, PRESET_BLUE_ORANGE, PRESET_RED_GREEN, type ColorBand, type ColorRule } from '../hudGrid'
import { baselineKeyFor } from '../hudEditor'
import type { CatalogStat } from './Palette'

const MIN_BAND_WIDTH = 0.5
const MAX_BANDS = 8
const FULL_SCALE = 100

/** Bands as a partition of 0–100: each starts where the previous one ends. */
export function normalizeBands(bands: ColorBand[]): ColorBand[] {
  const sorted = [...bands].sort((a, b) => a.from - b.from).slice(0, MAX_BANDS)
  return sorted.map((b, i) => ({ ...b, from: i === 0 ? 0 : sorted[i - 1].to, to: i === sorted.length - 1 ? FULL_SCALE : Math.max(b.to, (i === 0 ? 0 : sorted[i - 1].to) + MIN_BAND_WIDTH) }))
}

/** `<input type="color">` only takes `#rrggbb`. */
const asSixDigits = (color: string) => (/^#[0-9a-f]{6}$/i.test(color) ? color : /^#[0-9a-f]{3}$/i.test(color) ? `#${[...color.slice(1)].map((c) => c + c).join('')}` : color.slice(0, 7))

interface Props {
  rule: ColorRule
  section: string
  label: string
  catalog: CatalogStat[]
  onChange: (rule: ColorRule) => void
}

export default function ColorBands({ rule, section, label, catalog, onChange }: Props) {
  const { t } = useTranslation()
  const bar = useRef<HTMLDivElement>(null)
  const baselineKey = baselineKeyFor(section, label)
  const shown = rule.mode === 'bands' ? normalizeBands(rule.bands) : effectiveBands(rule, hudBaselines)
  const editable = rule.mode === 'bands'

  const setBands = (bands: ColorBand[]) => onChange({ ...rule, mode: 'bands', bands: normalizeBands(bands) })
  const patchBand = (index: number, change: Partial<ColorBand>) => setBands(shown.map((b, i) => (i === index ? { ...b, ...change } : b)))

  const dragHandle = (index: number, event: React.PointerEvent<HTMLDivElement>) => {
    const rect = bar.current?.getBoundingClientRect()
    if (!rect || !editable) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const move = (e: PointerEvent) => {
      const value = Math.round(((e.clientX - rect.left) / rect.width) * FULL_SCALE * 10) / 10
      const low = shown[index].from + MIN_BAND_WIDTH
      const high = shown[index + 1].to - MIN_BAND_WIDTH
      const boundary = Math.min(high, Math.max(low, value))
      setBands(shown.map((b, i) => (i === index ? { ...b, to: boundary } : i === index + 1 ? { ...b, from: boundary } : b)))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const addBand = () => {
    if (shown.length === 0) return setBands(PRESET_RED_GREEN)
    if (shown.length >= MAX_BANDS) return
    const widest = shown.reduce((best, b, i) => (b.to - b.from > shown[best].to - shown[best].from ? i : best), 0)
    const middle = Math.round(((shown[widest].from + shown[widest].to) / 2) * 10) / 10
    setBands([...shown.slice(0, widest), { ...shown[widest], to: middle }, { ...shown[widest], from: middle }, ...shown.slice(widest + 1)])
  }

  const removeBand = (index: number) => {
    if (shown.length <= 1) return onChange({ ...rule, mode: 'none', bands: [] })
    setBands(shown.filter((_, i) => i !== index))
  }

  const preset = (bands: ColorBand[]) => onChange({ ...rule, mode: 'bands', bands: bands.map((b) => ({ ...b })), baselineKey: undefined })
  const baselinePreset = () => {
    if (!baselineKey) return
    onChange({ ...rule, mode: 'baseline', baselineKey, bands: baselineBands(hudBaselines[baselineKey]) })
  }

  const field = 'w-14 rounded border border-dark-100 bg-dark-300 px-1 py-0.5 text-center font-mono text-[11px] text-gray-200 focus:border-primary-500 focus:outline-none'
  const button = 'rounded border border-dark-100 px-2 py-1 text-[11px] text-gray-300 hover:border-primary-500 disabled:opacity-40'

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        <button type="button" className={button} onClick={() => onChange({ ...rule, mode: 'none' })}>
          {t('liveHud.editor.colors.none')}
        </button>
        <button type="button" className={button} disabled={!baselineKey} title={baselineKey ? undefined : t('liveHud.editor.colors.no_baseline')} onClick={baselinePreset}>
          {t('liveHud.editor.colors.baseline')}
        </button>
        <button type="button" className={button} onClick={() => preset(PRESET_RED_GREEN)}>
          {t('liveHud.editor.colors.red_green')}
        </button>
        <button type="button" className={button} onClick={() => preset(PRESET_BLUE_ORANGE)}>
          {t('liveHud.editor.colors.blue_orange')}
        </button>
      </div>

      {rule.mode !== 'none' && (
        <>
          <div ref={bar} className="relative h-5 w-full select-none overflow-visible rounded border border-dark-100">
            {shown.map((b, i) => (
              <div key={i} className="absolute inset-y-0" style={{ left: `${b.from}%`, width: `${b.to - b.from}%`, background: b.color }} />
            ))}
            {editable &&
              shown.slice(0, -1).map((b, i) => (
                <div
                  key={`h${i}`}
                  className="absolute -top-1 bottom-[-4px] w-2 -translate-x-1 cursor-col-resize touch-none rounded-sm border border-white bg-dark-500"
                  style={{ left: `${b.to}%` }}
                  onPointerDown={(e) => dragHandle(i, e)}
                  title={String(b.to)}
                />
              ))}
          </div>
          <div className="flex justify-between font-mono text-[9px] text-gray-500">
            <span>0</span>
            <span>100</span>
          </div>

          {rule.mode === 'baseline' && <p className="text-[11px] text-gray-500">{t('liveHud.editor.colors.baseline_note')}</p>}

          {editable && (
            <div className="space-y-1">
              {shown.map((b, i) => (
                <div key={i} className="flex items-center gap-1">
                  <input type="color" value={asSixDigits(b.color)} onChange={(e) => patchBand(i, { color: e.target.value })} className="h-6 w-7 cursor-pointer rounded border border-dark-100 bg-transparent p-0" />
                  <span className="w-20 font-mono text-[11px] text-gray-400">
                    {b.from}–{b.to}
                  </span>
                  <label className="flex items-center gap-1 text-[11px] text-gray-400">
                    <input type="checkbox" checked={b.bold === true} onChange={(e) => patchBand(i, { bold: e.target.checked })} />
                    {t('liveHud.editor.colors.bold')}
                  </label>
                  <button type="button" className="ml-auto text-gray-500 hover:text-profit-negative" title={t('common.delete')} onClick={() => removeBand(i)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button type="button" className={button} disabled={editable && shown.length >= MAX_BANDS} onClick={addBand}>
            <Plus className="mr-1 inline h-3 w-3" />
            {t('liveHud.editor.colors.add_band')}
          </button>

          <label className="block text-[11px] text-gray-400">
            {t('liveHud.editor.colors.source')}
            <select
              className="mt-0.5 w-full rounded border border-dark-100 bg-dark-300 px-1 py-1 text-xs text-gray-200"
              value={rule.sourceStat ? `${rule.sourceStat.section}:${rule.sourceStat.label}` : ''}
              onChange={(e) => {
                const found = catalog.find((c) => c.id === e.target.value)
                onChange({ ...rule, sourceStat: found ? { section: found.section, label: found.label } : undefined })
              }}
            >
              <option value="">{t('liveHud.editor.colors.source_self')}</option>
              {catalog
                .filter((c) => c.section !== 'meta')
                .map((c) => (
                  <option key={c.id} value={c.id}>{`${c.label} (${c.section})`}</option>
                ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2 text-[11px] text-gray-400">
            {t('liveHud.editor.colors.min_sample')}
            <input type="number" min={0} className={field} value={rule.minSample} onChange={(e) => onChange({ ...rule, minSample: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
          </label>
        </>
      )}
    </div>
  )
}
