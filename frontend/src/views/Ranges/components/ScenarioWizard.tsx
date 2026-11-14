import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import Modal from '@/components/ui/Modal'
import { useUserRangesStore } from '@/stores/userRangesStore'
import {
  buildLine,
  defaultName,
  formatDepth,
  lineSummary,
  LINE_VERBS,
  parseLine,
  seatsBefore,
  seatsOf,
  type LineVerb,
  type Opponent,
  type Position,
  type RangeFormat,
  type SpotSummary,
} from '@/utils/ranges'

interface ScenarioWizardProps {
  open: boolean
  onClose: () => void
  /** The scenario being edited; without one the wizard creates a scenario. */
  editing?: SpotSummary | null
  /** A situation to start from (a hand without a range, for instance). */
  prefill?: { format: RangeFormat; hero: Position; line: string; opponent?: Opponent } | null
}

const MAX_DEPTH_BB = 200

function chipClass(active: boolean): string {
  return clsx(
    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
    active ? 'bg-primary-500 border-primary-500 text-onprimary' : 'bg-transparent border-dark-100 text-gray-300 hover:border-gray-500',
  )
}

/** The one-modal assistant that creates or edits a scenario (a situation and its depths). */
export default function ScenarioWizard({ open, onClose, editing = null, prefill = null }: ScenarioWizardProps) {
  const { t } = useTranslation()
  const { spots, settings, saveSpot, select } = useUserRangesStore()

  const [format, setFormat] = useState<RangeFormat>('3max')
  const [hero, setHero] = useState<Position>('BB')
  const [verbs, setVerbs] = useState<Partial<Record<Position, LineVerb>>>({})
  const [sizes, setSizes] = useState<Partial<Record<Position, string>>>({})
  const [opponent, setOpponent] = useState<Opponent>('any')
  const [depths, setDepths] = useState<number[]>([])
  const [extraDepths, setExtraDepths] = useState<number[]>([])
  const [otherDepth, setOtherDepth] = useState<string | null>(null)
  const [startKind, setStartKind] = useState<'empty' | 'spot'>('empty')
  const [copySpotId, setCopySpotId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [nameEdited, setNameEdited] = useState(false)
  const [quiz, setQuiz] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Each opening starts from the scenario being edited, a prefilled situation, or a blank form.
  useEffect(() => {
    if (!open) return
    const source = editing ?? (prefill ? { ...prefill, heroPosition: prefill.hero, opponent: prefill.opponent ?? 'any' } : null)
    setFormat(source?.format ?? '3max')
    setHero((editing?.heroPosition ?? prefill?.hero ?? 'BB') as Position)
    setVerbs(source ? parseLine(source.line) : {})
    setSizes(
      Object.fromEntries(Object.entries(editing?.lineSizes ?? {}).map(([seat, size]) => [seat, String(size)])) as Partial<Record<Position, string>>,
    )
    setOpponent((source?.opponent ?? 'any') as Opponent)
    setDepths(editing ? [] : settings.defaultStacks.slice(0, 1))
    setExtraDepths([])
    setOtherDepth(null)
    setStartKind('empty')
    setCopySpotId(null)
    setName(editing?.name ?? '')
    setNameEdited(Boolean(editing))
    setQuiz(editing ? !editing.studyOnly : true)
    setError(null)
  }, [open, editing, prefill, settings.defaultStacks])

  const seatsInFront = useMemo(() => seatsBefore(format, hero), [format, hero])
  const line = buildLine(format, hero, verbs)
  const proposedName = defaultName(format, hero, line, opponent)
  const shownName = nameEdited ? name : proposedName
  const stackChoices = useMemo(() => [...new Set([...settings.defaultStacks, ...extraDepths])].sort((a, b) => b - a), [settings.defaultStacks, extraDepths])

  const duplicate = spots.find((s) => s.id !== editing?.id && s.format === format && s.heroPosition === hero && s.line === line && s.opponent === opponent)
  const canSave = !duplicate && (editing !== null || depths.length > 0) && shownName.trim() !== '' && !saving

  const changeFormat = (next: RangeFormat) => {
    setFormat(next)
    if (!seatsOf(next).includes(hero)) setHero('BB')
  }

  const addOtherDepth = () => {
    const value = Number((otherDepth ?? '').replace(',', '.'))
    setOtherDepth(null)
    if (!(value > 0 && value <= MAX_DEPTH_BB)) return
    setExtraDepths((list) => [...list, value])
    setDepths((list) => (list.includes(value) ? list : [...list, value]))
  }

  const submit = async () => {
    setSaving(true)
    setError(null)
    const lineSizes = Object.fromEntries(
      seatsInFront.filter((seat) => verbs[seat] === 'raise' && Number(sizes[seat]) > 0).map((seat) => [seat, Number(sizes[seat])]),
    )
    const body = {
      id: editing?.id,
      name: shownName.trim(),
      format,
      heroPosition: hero,
      line,
      lineSizes: Object.keys(lineSizes).length > 0 ? lineSizes : null,
      opponent,
      studyOnly: !quiz,
      depths: [...depths].sort((a, b) => b - a),
      start: startKind === 'spot' && copySpotId !== null ? { kind: 'spot', spotId: copySpotId } : { kind: 'empty' },
    }
    const result = await saveSpot(body)
    setSaving(false)
    if (result.error) setError(result.error)
    else onClose()
  }

  const label = 'text-xs text-gray-400 mb-1.5'
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('ranges.wizard.editTitle') : t('ranges.wizard.title')}
      aside={<span className="text-sm text-info truncate max-w-[300px]">{shownName}</span>}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" disabled={!canSave} onClick={() => void submit()}>
            {editing ? t('common.save') : t('ranges.wizard.create', { count: depths.length })}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-6">
          <div>
            <div className={label}>{t('ranges.wizard.format')}</div>
            <div className="segmented">
              {(['3max', 'hu'] as const).map((value) => (
                <button key={value} aria-pressed={format === value} className={clsx('segmented-item', format === value && 'active')} onClick={() => changeFormat(value)}>
                  {t(`ranges.format.${value}`)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className={label}>{t('ranges.wizard.position')}</div>
            <div className="segmented">
              {seatsOf(format).map((seat) => (
                <button key={seat} aria-pressed={hero === seat} className={clsx('segmented-item', hero === seat && 'active')} onClick={() => setHero(seat)}>
                  {seat}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className={label}>{t('ranges.wizard.inFront')}</div>
          <div className="font-mono text-[13px] text-gray-100 mb-2">{line === '' ? t('ranges.wizard.firstToAct') : lineSummary(line)}</div>
          <div className="flex flex-col gap-2">
            {seatsInFront.map((seat) => (
              <div key={seat} className="flex items-center gap-2">
                <span className="w-9 text-sm font-bold text-gray-100">{seat}</span>
                {LINE_VERBS.map((verb) => {
                  const active = (verbs[seat] ?? 'fold') === verb
                  return (
                    <button key={verb} aria-pressed={active} className={chipClass(active)} onClick={() => setVerbs((v) => ({ ...v, [seat]: verb }))}>
                      {t(`ranges.verbs.${verb}`)}
                    </button>
                  )
                })}
                {verbs[seat] === 'raise' && (
                  <span className="flex items-center gap-1 ml-1">
                    <input
                      className="input w-16 font-mono text-right"
                      aria-label={t('ranges.wizard.raiseSize', { seat })}
                      inputMode="decimal"
                      value={sizes[seat] ?? ''}
                      onChange={(e) => setSizes((s) => ({ ...s, [seat]: e.target.value }))}
                    />
                    <span className="text-xs text-gray-400">bb</span>
                  </span>
                )}
              </div>
            ))}
          </div>
          {duplicate && (
            <p className="mt-2 text-xs text-deviation">
              {t('ranges.wizard.exists')}{' '}
              <button
                className="underline"
                onClick={() => {
                  select(duplicate.id)
                  onClose()
                }}
              >
                {t('ranges.wizard.open')}
              </button>
            </p>
          )}
        </div>

        <div>
          <div className={label}>{t('ranges.wizard.opponent')}</div>
          <div className="segmented">
            {(['any', 'reg'] as const).map((value) => (
              <button key={value} aria-pressed={opponent === value} className={clsx('segmented-item', opponent === value && 'active')} onClick={() => setOpponent(value)}>
                {t(`ranges.opponent.${value}`)}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-gray-500">{t('ranges.wizard.opponentHelp')}</p>
        </div>

        {!editing && (
          <>
            <div>
              <div className={label}>{t('ranges.wizard.depths')}</div>
              <div className="flex flex-wrap gap-2 items-center">
                {stackChoices.map((stack) => {
                  const active = depths.includes(stack)
                  return (
                    <button
                      key={stack}
                      aria-pressed={active}
                      className={clsx(chipClass(active), 'font-mono')}
                      onClick={() => setDepths((list) => (active ? list.filter((d) => d !== stack) : [...list, stack]))}
                    >
                      {formatDepth(stack)}
                    </button>
                  )
                })}
                {otherDepth === null ? (
                  <button className={chipClass(false)} onClick={() => setOtherDepth('')}>
                    {t('ranges.wizard.otherDepth')}
                  </button>
                ) : (
                  <input
                    autoFocus
                    className="input w-20 font-mono text-right"
                    aria-label={t('ranges.wizard.otherDepth')}
                    inputMode="decimal"
                    value={otherDepth}
                    onChange={(e) => setOtherDepth(e.target.value)}
                    onBlur={addOtherDepth}
                    onKeyDown={(e) => e.key === 'Enter' && addOtherDepth()}
                  />
                )}
              </div>
              {depths.length === 0 && <p className="mt-1.5 text-xs text-deviation">{t('ranges.wizard.depthRequired')}</p>}
            </div>

            <div>
              <div className={label}>{t('ranges.wizard.start')}</div>
              <div className="flex flex-col gap-2 text-sm text-gray-100">
                <label className="flex items-center gap-2">
                  <input type="radio" name="start" checked={startKind === 'empty'} onChange={() => setStartKind('empty')} />
                  {t('ranges.wizard.startEmpty')}
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="start" checked={startKind === 'spot'} disabled={spots.length === 0} onChange={() => { setStartKind('spot'); setCopySpotId((id) => id ?? spots[0]?.id ?? null) }} />
                  {t('ranges.wizard.startCopy')}
                  <select
                    className="select w-56"
                    aria-label={t('ranges.wizard.startCopy')}
                    disabled={startKind !== 'spot'}
                    value={copySpotId ?? ''}
                    onChange={(e) => setCopySpotId(Number(e.target.value))}
                  >
                    {spots.map((spot) => (
                      <option key={spot.id} value={spot.id}>
                        {spot.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </>
        )}

        <div>
          <div className={label}>{t('ranges.wizard.name')}</div>
          <input
            className="input"
            value={shownName}
            maxLength={80}
            onChange={(e) => {
              setName(e.target.value)
              setNameEdited(true)
            }}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-100">
          <input type="checkbox" checked={quiz} onChange={(e) => setQuiz(e.target.checked)} />
          {t('ranges.wizard.quiz')}
        </label>

        {error && (
          <p role="alert" className="text-sm text-profit-negative">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
