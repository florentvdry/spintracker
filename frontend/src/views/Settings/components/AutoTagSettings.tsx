import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Card from '@/components/ui/Card'
import { ipcService } from '@/services/ipcService'
import { useNotificationStore } from '@/stores/notificationStore'
import { logError } from '@/utils/log'

/** Stats a rule can read: figures every player has, and the shove stats. */
const RULE_SECTIONS = ['preflop', 'shove']
const MAX_TAG_CHARS = 24

interface Rule {
  tag: string
  section: string
  label: string
  column?: string | null
  comparison: 'atLeast' | 'atMost'
  threshold: number
  minSample: number
}

const emptyRule = (): Rule => ({ tag: '', section: 'preflop', label: 'VPIP', column: 'tot', comparison: 'atLeast', threshold: 50, minSample: 30 })

/** The rules that put tags on players ("Shover": Open Shove at least 60 % over 30 chances). */
export default function AutoTagSettings() {
  const { t } = useTranslation()
  const notify = useNotificationStore()
  const [rules, setRules] = useState<Rule[]>([])
  const [catalog, setCatalog] = useState<{ section: string; label: string }[]>([])

  useEffect(() => {
    void ipcService.getAutoTagRules().then((result) => result.success && setRules(result.data as Rule[]))
    void ipcService.getHudCatalog().then((result) => result.success && setCatalog(result.data?.stats ?? []))
  }, [])

  const stats = useMemo(() => catalog.filter((s) => RULE_SECTIONS.includes(s.section)), [catalog])
  const update = (index: number, patch: Partial<Rule>) => setRules((list) => list.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)))

  const save = async () => {
    try {
      const result = await ipcService.saveAutoTagRules(rules.map((rule) => ({ ...rule, tag: rule.tag.trim(), column: rule.section === 'preflop' ? 'tot' : null })))
      notify.addNotification(
        result.success ? { type: 'success', title: t('settings.auto_tags.saved'), message: '' } : { type: 'error', title: t('common.error'), message: t('settings.auto_tags.invalid') },
      )
    } catch (error) {
      logError('Failed to save the tag rules:', error)
    }
  }

  return (
    <Card title={t('settings.auto_tags.title')} subtitle={t('settings.auto_tags.subtitle')}>
      <div className="space-y-2">
        {rules.map((rule, index) => (
          // A rule has no id of its own: the list is edited in place or from its end.
          <div key={index} className="flex flex-wrap items-center gap-2 text-xs">
            <input className="input w-28" maxLength={MAX_TAG_CHARS} placeholder={t('settings.auto_tags.tag')} value={rule.tag} onChange={(e) => update(index, { tag: e.target.value })} />
            <select
              className="select w-44"
              value={`${rule.section}:${rule.label}`}
              onChange={(e) => {
                const [section, ...label] = e.target.value.split(':')
                update(index, { section, label: label.join(':') })
              }}
            >
              {stats.map((s) => (
                <option key={`${s.section}:${s.label}`} value={`${s.section}:${s.label}`}>{s.label}</option>
              ))}
              {!stats.some((s) => s.section === rule.section && s.label === rule.label) && <option value={`${rule.section}:${rule.label}`}>{rule.label}</option>}
            </select>
            <select className="select w-24" value={rule.comparison} onChange={(e) => update(index, { comparison: e.target.value as Rule['comparison'] })}>
              <option value="atLeast">≥</option>
              <option value="atMost">≤</option>
            </select>
            <input className="input w-16 font-mono" inputMode="decimal" value={rule.threshold} onChange={(e) => update(index, { threshold: Number(e.target.value) || 0 })} />
            <span className="text-gray-500">%</span>
            <span className="text-gray-500">{t('settings.auto_tags.over')}</span>
            <input className="input w-16 font-mono" inputMode="numeric" value={rule.minSample} onChange={(e) => update(index, { minSample: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
            <span className="text-gray-500">{t('settings.auto_tags.chances')}</span>
            <button className="btn-secondary p-1.5" onClick={() => setRules((list) => list.filter((_, i) => i !== index))} aria-label={t('common.delete')}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button className="btn-secondary flex items-center gap-1.5 text-xs" onClick={() => setRules((list) => [...list, emptyRule()])}>
          <Plus className="h-3.5 w-3.5" />
          {t('settings.auto_tags.add')}
        </button>
        <button className="btn-primary text-xs" onClick={() => void save()}>
          {t('settings.auto_tags.save')}
        </button>
      </div>
    </Card>
  )
}
