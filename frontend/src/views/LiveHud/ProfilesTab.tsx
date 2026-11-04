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
  HUD_VARIANTS,
  MAX_OPACITY,
  MAX_SIZE,
  MIN_OPACITY,
  MIN_SIZE,
  statKey,
  type HudBlock,
  type HudProfile,
  type HudStatRow,
} from './hudProfile'
import { PREVIEW_HANDS, previewFigures } from './previewData'

interface CatalogStat {
  section: string
  label: string
  id: string
  fixedSeat: boolean
}

const BLOCK_OF_SECTION: Record<string, HudBlock> = { threeWayPreflop: 'threeWay', huSb: 'headsUp', huBb: 'headsUp' }
/** Sections whose stats exist in several table columns; the whole-table column is the default. */
const SECTIONS_WITH_COLUMNS = ['preflop', 'steal', 'vsSteal']
const MAX_ROWS = 12
const ABBR_LENGTH = 6

const numberInput =
  'w-16 rounded border border-dark-100 bg-dark-300 px-1.5 py-1 text-center font-mono text-xs text-gray-200 focus:border-primary-500 focus:outline-none'

/** A limit typed by the user: empty means no limit. */
const parseLimit = (value: string): number | null => {
  if (value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null
}

export default function ProfilesTab() {
  const { t } = useTranslation()
  const notify = useNotificationStore()
  const { settings, updateProfile, setActiveProfile, addProfile, duplicateProfile, removeProfile, importProfilesFile } = useLiveHudStore()
  const profile = settings.profiles.find((p) => p.id === settings.activeProfileId) ?? settings.profiles[0]
  const [catalog, setCatalog] = useState<CatalogStat[]>([])
  const [picked, setPicked] = useState('')
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

  const rows = profile.stats[profile.variant]
  const figures = useMemo(() => previewFigures(rows), [rows])

  const edit = (change: (p: HudProfile) => HudProfile) => updateProfile(profile.id, change)
  const editRows = (change: (list: HudStatRow[]) => HudStatRow[]) =>
    edit((p) => ({ ...p, stats: { ...p.stats, [p.variant]: change(p.stats[p.variant]) } }))
  const editRow = (index: number, patch: Partial<HudStatRow>) => editRows((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)))

  const addStat = () => {
    const stat = catalog.find((c) => c.id === picked)
    if (!stat || rows.length >= MAX_ROWS) return
    editRows((list) => [
      ...list,
      {
        section: stat.section,
        label: stat.label,
        column: SECTIONS_WITH_COLUMNS.includes(stat.section) ? 'tot' : null,
        block: BLOCK_OF_SECTION[stat.section] ?? 'main',
        abbr: stat.label.slice(0, ABBR_LENGTH).trim(),
        below: null,
        above: null,
        minSample: DEFAULT_MIN_SAMPLE,
      },
    ])
    setPicked('')
  }

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

  const available = catalog.filter((c) => !rows.some((r) => r.section === c.section && r.label === c.label))

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <Card title={t('liveHud.profiles.mine')}>
        <div className="space-y-1">
          {settings.profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => setActiveProfile(p.id)}
              className={clsx(
                'w-full rounded-md border px-3 py-2 text-left text-sm',
                p.id === profile.id ? 'border-primary-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200',
              )}
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
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => void handleImport(e.target.files?.[0])}
          />
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
            {HUD_VARIANTS.map((variant) => (
              <button
                key={variant}
                onClick={() => edit((p) => ({ ...p, variant }))}
                className={clsx(
                  'rounded-md border px-3 py-1.5 text-sm',
                  variant === profile.variant ? 'border-primary-500 bg-primary-500 text-white' : 'border-dark-100 text-gray-300',
                )}
              >
                {t(`liveHud.variant.${variant}`)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">{t(`liveHud.variant_note.${profile.variant}`)}</p>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
          <Card title={t('liveHud.profiles.panel_stats')}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="pb-2 font-medium">{t('liveHud.profiles.col_block')}</th>
                  <th className="pb-2 font-medium">{t('liveHud.profiles.col_stat')}</th>
                  <th className="pb-2 font-medium">{t('liveHud.profiles.col_abbr')}</th>
                  <th className="pb-2 text-center font-medium text-[#8db4ff]">{t('liveHud.profiles.col_below')}</th>
                  <th className="pb-2 text-center font-medium text-[#ffa766]">{t('liveHud.profiles.col_above')}</th>
                  <th className="pb-2 text-center font-medium">{t('liveHud.profiles.col_sample')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={statKey(row)} className="border-t border-dark-100/40">
                    <td className="py-1.5 pr-2 text-gray-400">{t(`liveHud.block.${row.block}`)}</td>
                    <td className="py-1.5 pr-2 text-gray-200">{row.label}</td>
                    <td className="py-1.5 pr-2">
                      <input className={clsx(numberInput, 'w-14')} maxLength={ABBR_LENGTH} value={row.abbr} onChange={(e) => editRow(index, { abbr: e.target.value })} />
                    </td>
                    <td className="py-1.5 text-center">
                      <input className={numberInput} inputMode="decimal" placeholder="–" value={row.below ?? ''} onChange={(e) => editRow(index, { below: parseLimit(e.target.value) })} />
                    </td>
                    <td className="py-1.5 text-center">
                      <input className={numberInput} inputMode="decimal" placeholder="–" value={row.above ?? ''} onChange={(e) => editRow(index, { above: parseLimit(e.target.value) })} />
                    </td>
                    <td className="py-1.5 text-center">
                      <input
                        className={numberInput}
                        inputMode="numeric"
                        value={row.minSample}
                        onChange={(e) => editRow(index, { minSample: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                      />
                    </td>
                    <td className="py-1.5 pl-2 text-right">
                      <button
                        className="text-gray-500 hover:text-profit-negative"
                        title={t('common.delete')}
                        disabled={rows.length <= 1}
                        onClick={() => editRows((list) => list.filter((_, i) => i !== index))}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex gap-2">
              <select
                value={picked}
                onChange={(e) => setPicked(e.target.value)}
                className="max-w-xs flex-1 rounded border border-dark-100 bg-dark-300 px-2 py-1.5 text-sm text-gray-200"
              >
                <option value="">{t('liveHud.profiles.pick_stat')}</option>
                {available.map((c) => (
                  <option key={c.id} value={c.id}>{`${c.label} (${c.section})`}</option>
                ))}
              </select>
              <button className="btn-secondary" disabled={!picked || rows.length >= MAX_ROWS} onClick={addStat}>
                {t('liveHud.profiles.add_stat')}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">{t('liveHud.profiles.thresholds_note')}</p>
          </Card>

          <Card title={t('liveHud.profiles.preview')}>
            <div className="flex min-h-[170px] items-start rounded-md bg-dark-500 p-3">
              <HudPanel
                name={t('liveHud.preview.player', { n: 1 })}
                hands={PREVIEW_HANDS}
                variant={profile.variant}
                rows={rows}
                figures={figures}
                opacity={profile.opacity}
                size={profile.size}
                selected
              />
            </div>
            <label className="mt-3 block text-xs text-gray-400">
              {t('liveHud.profiles.opacity')} <span className="font-mono">{Math.round(profile.opacity * 100)}%</span>
              <input
                type="range"
                className="mt-1 w-full"
                min={MIN_OPACITY}
                max={MAX_OPACITY}
                step={0.02}
                value={profile.opacity}
                onChange={(e) => edit((p) => ({ ...p, opacity: Number(e.target.value) }))}
              />
            </label>
            <label className="mt-2 block text-xs text-gray-400">
              {t('liveHud.profiles.size')} <span className="font-mono">{Math.round(profile.size * 100)}%</span>
              <input
                type="range"
                className="mt-1 w-full"
                min={MIN_SIZE}
                max={MAX_SIZE}
                step={0.05}
                value={profile.size}
                onChange={(e) => edit((p) => ({ ...p, size: Number(e.target.value) }))}
              />
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={profile.showHero} onChange={(e) => edit((p) => ({ ...p, showHero: e.target.checked }))} />
              {t('liveHud.profiles.show_hero')}
            </label>
          </Card>
        </div>
      </div>
    </div>
  )
}
