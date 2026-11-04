import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { Copy, Download, Plus, Trash2, Upload, X } from 'lucide-react'
import HudPanel from '@/components/livehud/HudPanel'
import Card from '@/components/ui/Card'
import { ipcService } from '@/services/ipcService'
import { useLiveHudStore } from '@/stores/liveHudStore'
import { useNotificationStore } from '@/stores/notificationStore'
import {
  DEFAULT_MIN_SAMPLE,
  exportProfiles,
  HUD_FORMATS,
  MAX_OPACITY,
  MAX_SIZE,
  MIN_OPACITY,
  MIN_SIZE,
  type HudCell,
  type HudFamily,
  type HudFormat,
  type HudLayout,
  type HudProfile,
} from './hudProfile'
import { previewFigures } from './previewData'

interface CatalogStat {
  section: string
  label: string
  id: string
}

/** Sections whose stats exist in several table columns; the whole-table column is the default. */
const SECTIONS_WITH_COLUMNS = ['preflop', 'steal', 'vsSteal']
const MAX_CELLS = 12
const ABBR_LENGTH = 6

const FAMILY_OF_SECTION: Record<string, HudFamily> = { postflop: 'postflop', shove: 'shove', meta: 'count' }

const numberInput =
  'w-14 rounded border border-dark-100 bg-dark-300 px-1.5 py-1 text-center font-mono text-xs text-gray-200 focus:border-primary-500 focus:outline-none'

/** A limit typed by the user: empty means no limit. */
const parseLimit = (value: string): number | null => {
  if (value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null
}

interface CellsEditorProps {
  title: string
  cells: HudCell[]
  catalog: CatalogStat[]
  onChange: (cells: HudCell[]) => void
}

/** The figures of one table (or of the strip): abbreviation, thresholds and sample size of each. */
function CellsEditor({ title, cells, catalog, onChange }: CellsEditorProps) {
  const { t } = useTranslation()
  const [picked, setPicked] = useState('')
  const patch = (index: number, change: Partial<HudCell>) => onChange(cells.map((c, i) => (i === index ? { ...c, ...change } : c)))
  const available = catalog.filter((c) => !cells.some((x) => x.section === c.section && x.label === c.label))

  const add = () => {
    const stat = catalog.find((c) => c.id === picked)
    if (!stat || cells.length >= MAX_CELLS) return
    onChange([
      ...cells,
      {
        section: stat.section,
        label: stat.label,
        column: SECTIONS_WITH_COLUMNS.includes(stat.section) ? 'tot' : null,
        abbr: stat.label.slice(0, ABBR_LENGTH).trim(),
        family: FAMILY_OF_SECTION[stat.section] ?? 'open',
        below: null,
        above: null,
        minSample: DEFAULT_MIN_SAMPLE,
      },
    ])
    setPicked('')
  }

  return (
    <div className="border-t border-dark-100/40 pt-3 first:border-t-0 first:pt-0">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500">
            <th className="pb-1 font-medium">{t('liveHud.profiles.col_stat')}</th>
            <th className="pb-1 font-medium">{t('liveHud.profiles.col_abbr')}</th>
            <th className="pb-1 text-center font-medium text-[#8db4ff]">{t('liveHud.profiles.col_below')}</th>
            <th className="pb-1 text-center font-medium text-[#ffa766]">{t('liveHud.profiles.col_above')}</th>
            <th className="pb-1 text-center font-medium">{t('liveHud.profiles.col_sample')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {cells.map((cell, index) => (
            <tr key={`${cell.section}:${cell.label}:${index}`} className="border-t border-dark-100/30">
              <td className="py-1 pr-2 text-gray-200">
                {cell.label} <span className="text-xs text-gray-500">({cell.section})</span>
              </td>
              <td className="py-1 pr-2">
                <input className={numberInput} maxLength={ABBR_LENGTH} value={cell.abbr} onChange={(e) => patch(index, { abbr: e.target.value })} />
              </td>
              <td className="py-1 text-center">
                <input className={numberInput} inputMode="decimal" placeholder="–" value={cell.below ?? ''} onChange={(e) => patch(index, { below: parseLimit(e.target.value) })} />
              </td>
              <td className="py-1 text-center">
                <input className={numberInput} inputMode="decimal" placeholder="–" value={cell.above ?? ''} onChange={(e) => patch(index, { above: parseLimit(e.target.value) })} />
              </td>
              <td className="py-1 text-center">
                <input
                  className={numberInput}
                  inputMode="numeric"
                  value={cell.minSample}
                  onChange={(e) => patch(index, { minSample: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                />
              </td>
              <td className="py-1 pl-2 text-right">
                <button
                  className="text-gray-500 hover:text-profit-negative"
                  title={t('common.delete')}
                  disabled={cells.length <= 1}
                  onClick={() => onChange(cells.filter((_, i) => i !== index))}
                >
                  <X className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex gap-2">
        <select value={picked} onChange={(e) => setPicked(e.target.value)} className="max-w-xs flex-1 rounded border border-dark-100 bg-dark-300 px-2 py-1 text-sm text-gray-200">
          <option value="">{t('liveHud.profiles.pick_stat')}</option>
          {available.map((c) => (
            <option key={c.id} value={c.id}>{`${c.label} (${c.section})`}</option>
          ))}
        </select>
        <button className="btn-secondary" disabled={!picked || cells.length >= MAX_CELLS} onClick={add}>
          {t('liveHud.profiles.add_stat')}
        </button>
      </div>
    </div>
  )
}

export default function ProfilesTab() {
  const { t } = useTranslation()
  const notify = useNotificationStore()
  const { settings, updateProfile, setActiveProfile, addProfile, duplicateProfile, removeProfile, importProfilesFile } = useLiveHudStore()
  const profile = settings.profiles.find((p) => p.id === settings.activeProfileId) ?? settings.profiles[0]
  const [format, setFormat] = useState<HudFormat>('threeMax')
  const [catalog, setCatalog] = useState<CatalogStat[]>([])
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    void ipcService.getHudCatalog().then((result) => {
      if (!cancelled && result.success) setCatalog(result.data?.stats ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [])

  const layout = profile.layouts[format]
  const figures = useMemo(() => previewFigures(layout), [layout])

  const edit = (change: (p: HudProfile) => HudProfile) => updateProfile(profile.id, change)
  const editLayout = (change: (l: HudLayout) => HudLayout) =>
    edit((p) => ({ ...p, layouts: { ...p.layouts, [format]: change(p.layouts[format]) } }))

  const handleExport = () => {
    const url = URL.createObjectURL(new Blob([exportProfiles(settings.profiles)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'spintracker-hud-profiles.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async (file: File | undefined) => {
    if (!file) return
    const ok = importProfilesFile(await file.text())
    notify.addNotification(
      ok
        ? { type: 'success', message: t('liveHud.profiles.import_ok') }
        : { type: 'error', title: t('common.error'), message: t('liveHud.profiles.import_invalid') },
    )
    if (fileInput.current) fileInput.current.value = ''
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <Card title={t('liveHud.profiles.mine')}>
        <div className="space-y-1">
          {settings.profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => setActiveProfile(p.id)}
              className={clsx('w-full rounded-md border px-3 py-2 text-left text-sm', p.id === profile.id ? 'border-primary-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200')}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-secondary flex items-center gap-1.5" onClick={() => addProfile(t('liveHud.profiles.new_name'))}>
            <Plus className="h-3.5 w-3.5" />
            {t('liveHud.profiles.new')}
          </button>
          <button className="btn-secondary flex items-center gap-1.5" onClick={() => fileInput.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            {t('common.import')}
          </button>
          <button className="btn-secondary flex items-center gap-1.5" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" />
            {t('liveHud.profiles.export')}
          </button>
          <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void handleImport(e.target.files?.[0])} />
        </div>
        <p className="mt-3 text-xs text-gray-500">{t('liveHud.profiles.export_note')}</p>
      </Card>

      <div className="space-y-4">
        <Card
          title={t('liveHud.profiles.presentation')}
          header={
            <div className="flex items-center gap-2">
              <input
                value={profile.name}
                maxLength={40}
                onChange={(e) => edit((p) => ({ ...p, name: e.target.value }))}
                aria-label={t('liveHud.profiles.name')}
                className="w-44 rounded border border-dark-100 bg-dark-300 px-2 py-1 text-sm text-gray-200 focus:border-primary-500 focus:outline-none"
              />
              <button className="btn-icon" title={t('liveHud.profiles.duplicate')} onClick={() => duplicateProfile(profile.id, `${profile.name} (2)`)}>
                <Copy className="h-4 w-4" />
              </button>
              <button className="btn-icon" title={t('common.delete')} disabled={settings.profiles.length <= 1} onClick={() => removeProfile(profile.id)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          }
        >
          <div className="flex gap-2">
            {HUD_FORMATS.map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={clsx('rounded-md border px-3 py-1.5 text-sm', f === format ? 'border-primary-500 bg-primary-500 text-white' : 'border-dark-100 text-gray-300')}
              >
                {t(`liveHud.format.${f}`)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">{t('liveHud.profiles.layout_note')}</p>
        </Card>

        <Card title={t('liveHud.profiles.preview')}>
          <div className="flex min-h-[170px] items-start overflow-auto rounded-md bg-dark-500 p-3">
            <HudPanel
              name={t('liveHud.preview.player', { n: 1 })}
              layout={layout}
              figures={figures}
              opacity={profile.opacity}
              size={profile.size}
              selected
            />
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <label className="block text-xs text-gray-400">
              {t('liveHud.profiles.opacity')} <span className="font-mono">{Math.round(profile.opacity * 100)}%</span>
              <input type="range" className="mt-1 w-full" min={MIN_OPACITY} max={MAX_OPACITY} step={0.02} value={profile.opacity} onChange={(e) => edit((p) => ({ ...p, opacity: Number(e.target.value) }))} />
            </label>
            <label className="block text-xs text-gray-400">
              {t('liveHud.profiles.size')} <span className="font-mono">{Math.round(profile.size * 100)}%</span>
              <input type="range" className="mt-1 w-full" min={MIN_SIZE} max={MAX_SIZE} step={0.05} value={profile.size} onChange={(e) => edit((p) => ({ ...p, size: Number(e.target.value) }))} />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={profile.showHero} onChange={(e) => edit((p) => ({ ...p, showHero: e.target.checked }))} />
              {t('liveHud.profiles.show_hero')}
            </label>
          </div>
        </Card>

        <Card title={t('liveHud.profiles.panel_stats')}>
          <div className="space-y-4">
            <CellsEditor title={t('liveHud.profiles.strip')} cells={layout.strip} catalog={catalog} onChange={(strip) => editLayout((l) => ({ ...l, strip }))} />
            {layout.tables.map((table) => (
              <CellsEditor
                key={table.id}
                title={`${table.title} · ${t(`liveHud.profiles.rows_${table.rows}`)}`}
                cells={table.cells}
                catalog={catalog}
                onChange={(cells) => editLayout((l) => ({ ...l, tables: l.tables.map((x) => (x.id === table.id ? { ...x, cells } : x)) }))}
              />
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">{t('liveHud.profiles.thresholds_note')}</p>
        </Card>
      </div>
    </div>
  )
}
