import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Card from '@/components/ui/Card'
import { ipcService, type Json } from '@/services/ipcService'
import { useFilterStore } from '@/stores/filterStore'
import { useLiveHudStore } from '@/stores/liveHudStore'
import { exportProfiles, type HudProfile } from '@/views/LiveHud/hudProfile'
import { buildPack, buildReport, parseGallery, parsePack, parseReport, respectShare, type GalleryEntry, type Pack, type PackContent, type PackSummary, type Report } from '@/utils/packs'

const PERCENT = 100
const PACK_EXTENSION = 'spinpack'
const REPORT_EXTENSION = 'spinreport'

type Notice = { ok: boolean; text: string }

/** Share a set of ranges, custom stats and an HUD profile as a file, and send back a report of counts. */
export default function PacksSettings() {
  const { t } = useTranslation()
  const heroName = useFilterStore((s) => s.heroName)
  const { settings, importProfilesFile } = useLiveHudStore()
  const packInput = useRef<HTMLInputElement>(null)
  const reportInput = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [author, setAuthor] = useState('')
  const [withRanges, setWithRanges] = useState(true)
  const [withStats, setWithStats] = useState(false)
  const [withHud, setWithHud] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [opened, setOpened] = useState<{ pack: Pack; summary: PackSummary } | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [reportPack, setReportPack] = useState('')
  const [gallery, setGallery] = useState<{ plugins: GalleryEntry[]; skipped: number } | null>(null)
  const galleryInput = useRef<HTMLInputElement>(null)

  const save = async (title: string, fileName: string, content: unknown, extension: string): Promise<boolean> => {
    const saved = await ipcService.saveTextFile(title, fileName, JSON.stringify(content, null, 2), extension)
    if (!saved.success && !saved.cancelled) setNotice({ ok: false, text: saved.message ?? t('settings.packs.failed') })
    return Boolean(saved.success)
  }

  const createPack = async () => {
    setNotice(null)
    const content: PackContent = { name, author }
    if (withRanges) {
      const result = await ipcService.exportRanges()
      if (!result.success) return setNotice({ ok: false, text: result.message ?? t('settings.packs.failed') })
      content.ranges = result.data
    }
    if (withStats) {
      const result = await ipcService.getCustomStats()
      const definitions = result.success ? (result.data as Json[]).map((stat) => stat.definition) : []
      if (definitions.length > 0) content.customStats = definitions
    }
    if (withHud) {
      const profile = settings.profiles.find((p) => p.id === settings.activeProfileId) ?? settings.profiles[0]
      if (profile) content.hudProfile = profile
    }
    if (content.ranges === undefined && content.hudProfile === undefined && !content.customStats) return setNotice({ ok: false, text: t('settings.packs.nothing') })
    const pack = buildPack(content, new Date())
    if (await save(t('settings.packs.save_pack'), `${pack.name || 'pack'}.${PACK_EXTENSION}`, pack, PACK_EXTENSION)) setNotice({ ok: true, text: t('settings.packs.created') })
  }

  const openPack = async (file: File | undefined) => {
    if (!file) return
    const parsed = parsePack(await file.text())
    if (!parsed.ok) return setNotice({ ok: false, text: t(`settings.packs.error.${parsed.error}`) })
    setNotice(null)
    setOpened({ pack: parsed.pack, summary: parsed.summary })
    setReportPack(parsed.pack.name)
  }

  const openGallery = async (file: File | undefined) => {
    if (!file) return
    const parsed = parseGallery(await file.text())
    if (!parsed.ok) return setNotice({ ok: false, text: t(`settings.packs.gallery_error.${parsed.error}`) })
    setNotice(null)
    setGallery({ plugins: parsed.plugins, skipped: parsed.skipped })
  }

  const applyPack = async () => {
    if (!opened) return
    const { pack } = opened
    const parts: string[] = []
    if (pack.ranges !== undefined) {
      const result = await ipcService.importRanges(JSON.stringify(pack.ranges), 'merge')
      parts.push(result.success ? t('settings.packs.ranges_added') : (result.message ?? t('settings.packs.failed')))
    }
    if (pack.customStats) {
      let added = 0
      for (const definition of pack.customStats) if ((await ipcService.createCustomStat(definition)).success) added += 1
      parts.push(t('settings.packs.stats_added', { added, total: pack.customStats.length }))
    }
    if (pack.hudProfile !== undefined) {
      parts.push(t(importProfilesFile(exportProfiles([pack.hudProfile as HudProfile])) ? 'settings.packs.hud_added' : 'settings.packs.hud_refused'))
    }
    setOpened(null)
    setNotice({ ok: true, text: parts.join(' ') })
  }

  const exportReport = async () => {
    setNotice(null)
    if (!heroName) return setNotice({ ok: false, text: t('settings.packs.no_hero') })
    const result = await ipcService.getRangeAdherence(heroName, null, null, null)
    if (!result.success) return setNotice({ ok: false, text: result.message ?? t('settings.packs.failed') })
    const built = buildReport(reportPack, result.data, new Date())
    if (await save(t('settings.packs.save_report'), `report.${REPORT_EXTENSION}`, built, REPORT_EXTENSION)) setNotice({ ok: true, text: t('settings.packs.report_saved') })
  }

  const openReport = async (file: File | undefined) => {
    if (!file) return
    const parsed = parseReport(await file.text())
    if (!parsed.ok) return setNotice({ ok: false, text: t(`settings.packs.report_error.${parsed.error}`) })
    setNotice(null)
    setReport(parsed.report)
  }

  const share = report ? respectShare(report.adherence.compared, report.adherence.matches) : null

  return (
    <Card title={t('settings.packs.title')} subtitle={t('settings.packs.subtitle')}>
      <div className="space-y-5">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-100">{t('settings.packs.create')}</h4>
          <div className="flex flex-wrap gap-2">
            <input className="input" value={name} maxLength={80} placeholder={t('settings.packs.name')} aria-label={t('settings.packs.name')} onChange={(e) => setName(e.target.value)} />
            <input className="input" value={author} maxLength={80} placeholder={t('settings.packs.author')} aria-label={t('settings.packs.author')} onChange={(e) => setAuthor(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-gray-100">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={withRanges} onChange={(e) => setWithRanges(e.target.checked)} />
              {t('settings.packs.with_ranges')}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={withStats} onChange={(e) => setWithStats(e.target.checked)} />
              {t('settings.packs.with_stats')}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={withHud} onChange={(e) => setWithHud(e.target.checked)} />
              {t('settings.packs.with_hud')}
            </label>
          </div>
          <button className="btn-secondary" disabled={!name.trim()} onClick={() => void createPack()}>
            {t('settings.packs.create_button')}
          </button>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-100">{t('settings.packs.open')}</h4>
          <button className="btn-secondary" onClick={() => packInput.current?.click()}>
            {t('settings.packs.open_button')}
          </button>
          <input
            ref={packInput}
            type="file"
            accept=".spinpack,application/json"
            className="hidden"
            aria-label={t('settings.packs.open_button')}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              void openPack(file)
            }}
          />
          {opened && (
            <div className="rounded-lg border border-dark-200 p-3 text-sm text-gray-100 space-y-1">
              <p className="font-semibold">{opened.summary.name}</p>
              {opened.summary.author && <p className="text-xs text-gray-400">{t('settings.packs.by', { author: opened.summary.author })}</p>}
              <ul className="list-disc pl-5 text-xs text-gray-400">
                {opened.summary.hasRanges && <li>{t('settings.packs.holds_ranges')}</li>}
                {opened.summary.customStats > 0 && <li>{t('settings.packs.holds_stats', { count: opened.summary.customStats })}</li>}
                {opened.summary.hasHudProfile && <li>{t('settings.packs.holds_hud')}</li>}
              </ul>
              <p className="text-xs text-gray-500">{t('settings.packs.will_do')}</p>
              <div className="flex gap-2 pt-1">
                <button className="btn-secondary" onClick={() => void applyPack()}>
                  {t('settings.packs.apply')}
                </button>
                <button className="btn-secondary" onClick={() => setOpened(null)}>
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-100">{t('settings.packs.gallery')}</h4>
          <p className="text-xs text-gray-500">{t('settings.packs.gallery_hint')}</p>
          <button className="btn-secondary" onClick={() => galleryInput.current?.click()}>
            {t('settings.packs.gallery_open')}
          </button>
          <input
            ref={galleryInput}
            type="file"
            accept=".spingallery,application/json"
            className="hidden"
            aria-label={t('settings.packs.gallery_open')}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              void openGallery(file)
            }}
          />
          {gallery && (
            <ul className="space-y-2">
              {gallery.plugins.map((entry) => (
                <li key={entry.pack.id ?? `${entry.pack.name}-${entry.pack.createdAt}`} className="flex items-start justify-between gap-3 rounded-lg border border-dark-200 p-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-100">
                      {entry.pack.name} <span className="text-xs font-normal text-gray-500">{t(`settings.packs.kind.${entry.summary.kind}`)}</span>
                    </p>
                    {entry.summary.description && <p className="text-xs text-gray-400">{entry.summary.description}</p>}
                  </div>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setOpened(entry)
                      setReportPack(entry.pack.name)
                    }}
                  >
                    {t('settings.packs.gallery_choose')}
                  </button>
                </li>
              ))}
              {gallery.skipped > 0 && <li className="text-xs text-gray-500">{t('settings.packs.gallery_skipped', { count: gallery.skipped })}</li>}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-100">{t('settings.packs.report')}</h4>
          <p className="text-xs text-gray-500">{t('settings.packs.report_hint')}</p>
          <div className="flex flex-wrap gap-2">
            <input className="input" value={reportPack} maxLength={80} placeholder={t('settings.packs.report_pack')} aria-label={t('settings.packs.report_pack')} onChange={(e) => setReportPack(e.target.value)} />
            <button className="btn-secondary" onClick={() => void exportReport()}>
              {t('settings.packs.report_export')}
            </button>
            <button className="btn-secondary" onClick={() => reportInput.current?.click()}>
              {t('settings.packs.report_open')}
            </button>
            <input
              ref={reportInput}
              type="file"
              accept=".spinreport,application/json"
              className="hidden"
              aria-label={t('settings.packs.report_open')}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                void openReport(file)
              }}
            />
          </div>
          {report && (
            <div className="rounded-lg border border-dark-200 p-3 text-sm text-gray-100 space-y-1">
              <p className="font-semibold">{report.pack || t('settings.packs.report_unnamed')}</p>
              <p className="text-xs text-gray-400">
                {share === null
                  ? t('settings.packs.report_none')
                  : t('settings.packs.report_total', { matches: report.adherence.matches, compared: report.adherence.compared, pct: (share * PERCENT).toFixed(1) })}
              </p>
              <ul className="text-xs text-gray-400">
                {report.adherence.scenarios.map((scenario) => (
                  <li key={`${scenario.name}-${scenario.stackBb}`}>{t('settings.packs.report_scenario', { name: scenario.name, stack: scenario.stackBb, matches: scenario.matches, decisions: scenario.decisions })}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      {notice && <p className={`mt-3 text-xs ${notice.ok ? 'text-profit-positive' : 'text-profit-negative'}`}>{notice.text}</p>}
    </Card>
  )
}
