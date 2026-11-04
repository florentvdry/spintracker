import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { Plus, Trash2, X } from 'lucide-react'
import { ipcService } from '@/services/ipcService'
import { useFilterStore } from '@/stores/filterStore'
import { useCustomStatsStore } from '@/stores/customStatsStore'
import {
  ACTIONS, STREETS, LEAF_TYPES, RANGE_LIMITS, cleanDefinition, countLeaves, defaultLeaf, emptyDefinition, isGroup, parseBound,
  copyOf, flagLabel, isSituationFlag, validateDefinition, type ActionName, type Cond, type CustomStat, type CustomStatDef, type LeafType, type Range, type Street,
} from './customStatModel'

const PREVIEW_DEBOUNCE_MS = 400

function FlagPicker({ value, flags, onChange }: { value: string; flags: string[]; onChange: (name: string) => void }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  // The current flag stays listed so the select never shows a value it cannot display.
  const shown = flags.filter((name) => name === value || !needle || flagLabel(name).toLowerCase().includes(needle))
  const option = (name: string) => <option key={name} value={name}>{flagLabel(name)}</option>
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1">
      <input className={clsx(field, 'w-24')} value={query} placeholder={t('customStats.search')} onChange={(e) => setQuery(e.target.value)} />
      <select className={clsx(field, 'min-w-0 flex-1')} value={value} onChange={(e) => onChange(e.target.value)}>
        <optgroup label={t('customStats.flag_situations')}>{shown.filter(isSituationFlag).map(option)}</optgroup>
        <optgroup label={t('customStats.flag_actions')}>{shown.filter((name) => !isSituationFlag(name)).map(option)}</optgroup>
      </select>
    </span>
  )
}

const field = 'rounded border border-dark-100 bg-dark-300 px-2 py-1 text-xs text-gray-200 focus:border-primary-500 focus:outline-none'
const smallButton = 'inline-flex items-center gap-1 rounded border border-dark-100 bg-dark-300 px-2 py-1 text-xs text-gray-200 hover:border-primary-500 disabled:opacity-40'

interface Preview {
  num: number
  den: number
  hands: number
  pct: number | null
}

function RangeFields({ range, limit, onChange }: { range: Range; limit: number; onChange: (range: Range) => void }) {
  const { t } = useTranslation()
  const edit = (key: 'min' | 'max') => (text: string) => {
    const bound = parseBound(text)
    if (bound !== undefined) onChange({ ...range, [key]: bound })
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input className={clsx(field, 'w-16')} inputMode="decimal" placeholder={t('customStats.min')} defaultValue={range.min ?? ''} onChange={(e) => edit('min')(e.target.value)} />
      <span className="text-gray-500">–</span>
      <input className={clsx(field, 'w-16')} inputMode="decimal" placeholder={t('customStats.max')} defaultValue={range.max ?? ''} onChange={(e) => edit('max')(e.target.value)} />
      <span className="text-[10px] text-gray-600">≤ {limit}</span>
    </span>
  )
}

function StreetSelect({ value, onChange, skipPreflop }: { value: Street; onChange: (street: Street) => void; skipPreflop?: boolean }) {
  const { t } = useTranslation()
  return (
    <select className={field} value={value} onChange={(e) => onChange(e.target.value as Street)}>
      {STREETS.filter((s) => !skipPreflop || s !== 'preflop').map((s) => (
        <option key={s} value={s}>{t(`customStats.street.${s}`)}</option>
      ))}
    </select>
  )
}

function LeafFields({ cond, flags, onChange }: { cond: Cond; flags: string[]; onChange: (cond: Cond) => void }) {
  const { t } = useTranslation()
  switch (cond.type) {
    case 'flag':
      return <FlagPicker value={cond.name} flags={flags} onChange={(name) => onChange({ ...cond, name })} />
    case 'inPosition':
      return null
    case 'action':
      return (
        <>
          <StreetSelect value={cond.street} onChange={(street) => onChange({ ...cond, street })} />
          <select className={field} value={cond.action} onChange={(e) => onChange({ ...cond, action: e.target.value as ActionName })}>
            {ACTIONS.map((a) => <option key={a} value={a}>{t(`customStats.action.${a}`)}</option>)}
          </select>
          <select className={field} value={cond.allIn === true ? 'yes' : cond.allIn === false ? 'no' : 'any'} onChange={(e) => onChange({ ...cond, allIn: e.target.value === 'any' ? null : e.target.value === 'yes' })}>
            <option value="any">{t('customStats.all_in.any')}</option>
            <option value="yes">{t('customStats.all_in.yes')}</option>
            <option value="no">{t('customStats.all_in.no')}</option>
          </select>
        </>
      )
    case 'facingAggression':
      return <StreetSelect value={cond.street} onChange={(street) => onChange({ ...cond, street })} />
    case 'betSizePercentPot':
      return (
        <>
          <StreetSelect value={cond.street} skipPreflop onChange={(street) => onChange({ ...cond, street })} />
          <RangeFields range={cond.range} limit={RANGE_LIMITS.betSizePercentPot} onChange={(range) => onChange({ ...cond, range })} />
        </>
      )
    case 'and':
    case 'or':
    case 'not':
      return null
    default:
      return <RangeFields range={cond.range} limit={RANGE_LIMITS[cond.type]} onChange={(range) => onChange({ ...cond, range })} />
  }
}

interface CondEditorProps {
  cond: Cond
  flags: string[]
  onChange: (cond: Cond) => void
  onRemove?: () => void
  canAdd: boolean
}

/** A condition: a group (all of / any of) holding conditions, a negation, or a single test. */
function CondEditor({ cond, flags, onChange, onRemove, canAdd }: CondEditorProps) {
  const { t } = useTranslation()
  const remove = onRemove && (
    <button type="button" className="text-gray-500 hover:text-red-400" onClick={onRemove} aria-label={t('customStats.remove')}>
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )

  if (isGroup(cond)) {
    const setItem = (index: number, next: Cond) => onChange({ ...cond, items: cond.items.map((item, i) => (i === index ? next : item)) })
    return (
      <div className="space-y-1.5 rounded border border-dark-100 p-2">
        <div className="flex items-center gap-2">
          <select className={field} value={cond.type} onChange={(e) => onChange({ ...cond, type: e.target.value as 'and' | 'or' })}>
            <option value="and">{t('customStats.group.and')}</option>
            <option value="or">{t('customStats.group.or')}</option>
          </select>
          <span className="flex-1" />
          {remove}
        </div>
        {cond.items.map((item, index) => (
          <CondEditor
            // Rows are edited in place and only ever appended or removed, so the position is a stable identity here.
            key={`${index}-${item.type}`}
            cond={item}
            flags={flags}
            canAdd={canAdd}
            onChange={(next) => setItem(index, next)}
            onRemove={cond.items.length > 1 || onRemove ? () => onChange({ ...cond, items: cond.items.filter((_, i) => i !== index) }) : undefined}
          />
        ))}
        <div className="flex gap-1">
          <button type="button" className={smallButton} disabled={!canAdd} onClick={() => onChange({ ...cond, items: [...cond.items, defaultLeaf('flag', flags[0])] })}>
            <Plus className="h-3 w-3" /> {t('customStats.add_condition')}
          </button>
          <button type="button" className={smallButton} disabled={!canAdd} onClick={() => onChange({ ...cond, items: [...cond.items, { type: 'or', items: [defaultLeaf('flag', flags[0])] }] })}>
            <Plus className="h-3 w-3" /> {t('customStats.add_group')}
          </button>
        </div>
      </div>
    )
  }

  if (cond.type === 'not') {
    return (
      <div className="flex items-start gap-2">
        <span className="mt-1 rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-300">{t('customStats.not')}</span>
        <div className="min-w-0 flex-1">
          <CondEditor cond={cond.item} flags={flags} canAdd={canAdd} onChange={(item) => onChange({ ...cond, item })} />
        </div>
        <button type="button" className="mt-1 text-xs text-gray-500 hover:text-gray-200" onClick={() => onChange(cond.item)}>{t('customStats.unnegate')}</button>
        {remove}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        className={field}
        value={cond.type}
        onChange={(e) => onChange(defaultLeaf(e.target.value as LeafType, flags[0]))}
      >
        {LEAF_TYPES.map((type) => <option key={type} value={type}>{t(`customStats.leaf.${type}`)}</option>)}
      </select>
      <LeafFields cond={cond} flags={flags} onChange={onChange} />
      <button type="button" className="text-xs text-gray-500 hover:text-gray-200" onClick={() => onChange({ type: 'not', item: cond })}>{t('customStats.negate')}</button>
      {remove}
    </div>
  )
}

function ToggleList<T extends string | number>({ values, selected, label, onChange }: { values: T[]; selected: T[]; label: (v: T) => string; onChange: (next: T[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((value) => {
        const on = selected.includes(value)
        return (
          <button
            key={value}
            type="button"
            className={clsx('rounded border px-2 py-0.5 text-xs', on ? 'border-primary-500 bg-primary-500/20 text-white' : 'border-dark-100 bg-dark-300 text-gray-300')}
            onClick={() => onChange(on ? selected.filter((v) => v !== value) : [...selected, value])}
          >
            {label(value)}
          </button>
        )
      })}
    </div>
  )
}

interface Props {
  /** The stat being edited; `null` creates one. */
  stat: CustomStat | null
  /** The definition a new stat starts from (a duplicate). */
  template?: CustomStatDef
  onClose: () => void
}

export default function StatBuilder({ stat, template, onClose }: Props) {
  const { t } = useTranslation()
  const options = useCustomStatsStore((s) => s.options)
  const save = useCustomStatsStore((s) => s.save)
  const statCount = useCustomStatsStore((s) => s.stats.length)
  const heroName = useFilterStore((s) => s.heroName)

  const [draft, setDraft] = useState<CustomStatDef>(() => stat?.definition ?? (template ? copyOf(template, t('customStats.copy_suffix'), options.limits.nameChars) : emptyDefinition(options.flags[0])))
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)

  const problem = useMemo(() => validateDefinition(draft, options), [draft, options])
  const leaves = countLeaves(draft.numerator) + (draft.denominator ? countLeaves(draft.denominator) : 0)
  const canAdd = leaves < options.limits.leaves
  const atLimit = stat === null && statCount >= options.limits.stats

  // The live figure over the latest hands; answers of an older draft are ignored.
  useEffect(() => {
    if (problem) {
      setPreview(null)
      return
    }
    let stale = false
    const timer = setTimeout(() => {
      void ipcService.previewCustomStat(cleanDefinition(draft), heroName).then((result) => {
        if (!stale && result.success) setPreview(result.data as Preview)
      })
    }, PREVIEW_DEBOUNCE_MS)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [draft, problem, heroName])

  const submit = async () => {
    setSaving(true)
    setServerError(null)
    const error = await save(stat?.id ?? null, draft)
    setSaving(false)
    if (error) setServerError(error)
    else onClose()
  }

  const setFilters = (patch: Partial<CustomStatDef['filters']>) => setDraft((d) => ({ ...d, filters: { ...d.filters, ...patch } }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-lg border border-dark-100 bg-dark-400 shadow-xl">
        <div className="flex items-center justify-between border-b border-dark-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-white">{t(stat ? 'customStats.title_edit' : 'customStats.title_new')}</h2>
          <button type="button" className="text-gray-400 hover:text-white" onClick={onClose} aria-label={t('common.close', { defaultValue: 'Close' })}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {stat === null && (options.presets?.length ?? 0) > 0 && (
            <label className="block text-xs text-gray-400">
              {t('customStats.example')}
              <select
                className={clsx(field, 'mt-1 block w-full')}
                value=""
                onChange={(e) => {
                  const preset = options.presets?.find((p) => p.id === e.target.value)
                  if (preset) setDraft({ ...preset.definition, name: t(`customStats.preset.${preset.id}`) })
                }}
              >
                <option value="">{t('customStats.example_none')}</option>
                {options.presets?.map((p) => <option key={p.id} value={p.id}>{t(`customStats.preset.${p.id}`)}</option>)}
              </select>
            </label>
          )}

          <label className="block text-xs text-gray-400">
            {t('customStats.name')}
            <input className={clsx(field, 'mt-1 block w-full')} maxLength={options.limits.nameChars} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>

          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{t('customStats.numerator')}</h3>
            <p className="mb-1 text-[11px] text-gray-500">{t('customStats.numerator_hint')}</p>
            <CondEditor cond={draft.numerator} flags={options.flags} canAdd={canAdd} onChange={(numerator) => setDraft({ ...draft, numerator })} />
          </section>

          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{t('customStats.denominator')}</h3>
            <p className="mb-1 text-[11px] text-gray-500">{t('customStats.denominator_hint')}</p>
            {draft.denominator ? (
              <div className="space-y-1">
                <CondEditor cond={draft.denominator} flags={options.flags} canAdd={canAdd} onChange={(denominator) => setDraft({ ...draft, denominator })} />
                <button type="button" className={smallButton} onClick={() => setDraft({ ...draft, denominator: null })}>{t('customStats.all_hands')}</button>
              </div>
            ) : (
              <button type="button" className={smallButton} disabled={!canAdd} onClick={() => setDraft({ ...draft, denominator: { type: 'and', items: [defaultLeaf('flag', options.flags[0])] } })}>
                <Plus className="h-3 w-3" /> {t('customStats.restrict_denominator')}
              </button>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t('customStats.filters')}</h3>
            <div>
              <p className="mb-1 text-[11px] text-gray-500">{t('customStats.positions')}</p>
              <ToggleList values={options.positions} selected={draft.filters.positions} label={(v) => v} onChange={(positions) => setFilters({ positions })} />
            </div>
            <div>
              <p className="mb-1 text-[11px] text-gray-500">{t('customStats.table_sizes')}</p>
              <ToggleList values={options.tableSizes} selected={draft.filters.tableSizes} label={(n) => t('customStats.table_size', { count: n })} onChange={(tableSizes) => setFilters({ tableSizes })} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-500">{t('customStats.stack_bb')}</span>
              <RangeFields range={draft.filters.stackBb ?? {}} limit={RANGE_LIMITS.stackBb} onChange={(stackBb) => setFilters({ stackBb })} />
            </div>
          </section>

          <p className="text-[11px] text-gray-500">{t('customStats.limits', { leaves, max: options.limits.leaves })}</p>
        </div>

        <div className="space-y-2 border-t border-dark-100 px-4 py-3">
          <p className="min-h-[1.25rem] text-xs text-gray-300" aria-live="polite">
            {problem ? (
              <span className="text-amber-300">{t(`customStats.error.${problem}`)}</span>
            ) : preview ? (
              preview.den === 0
                ? t('customStats.preview_empty', { hands: preview.hands })
                : t('customStats.preview', { num: preview.num, den: preview.den, pct: (preview.pct ?? 0).toFixed(1), hands: preview.hands })
            ) : null}
          </p>
          {serverError && <p className="text-xs text-red-400">{serverError}</p>}
          {atLimit && <p className="text-xs text-amber-300">{t('customStats.error.too_many')}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={smallButton} onClick={onClose}>{t('customStats.cancel')}</button>
            <button type="button" className={clsx(smallButton, 'border-primary-500 bg-primary-500/20 text-white')} disabled={problem !== null || saving || atLimit} onClick={() => void submit()}>
              {t('customStats.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
