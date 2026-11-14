import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import ActionChip from '@/components/ranges/ActionChip'
import QuizTable from '@/components/ranges/QuizTable'
import RangeMatrix, { type MatrixCell } from '@/components/ranges/RangeMatrix'
import { ipcService } from '@/services/ipcService'
import { useFilterStore } from '@/stores/filterStore'
import { useTrainingStore } from '@/stores/trainingStore'
import { useUserRangesStore } from '@/stores/userRangesStore'
import { formatDepth, textColor } from '@/utils/ranges'
import { choiceForKey, needsResponse, responseForKey, responseOptions, score, SESSION_LENGTH, wrongPart, type QuizSource } from '@/utils/training'

const SOURCES: QuizSource[] = ['scenario', 'program', 'deviation']

interface TrainingProps {
  /** Opens a range in the editor. */
  onOpenRange: (spotId: number, scenarioId: number) => void
}

export default function Training({ onOpenRange }: TrainingProps) {
  const { t } = useTranslation()
  const heroName = useFilterStore((s) => s.heroName)
  const { spots, programs, actions } = useUserRangesStore()
  const store = useTrainingStore()
  const { source, spotId, programId, deviationScenarioId, question, verdict, pickedActionId, pickedResponse, session, answered, loading, empty } = store
  const [deviationCount, setDeviationCount] = useState<number | null>(null)

  const quizSpots = useMemo(() => spots.filter((s) => !s.studyOnly), [spots])

  // A source needs something to draw from: default to the first program or scenario.
  useEffect(() => {
    if (spotId === null && quizSpots[0]) store.setSource(source, { spotId: quizSpots[0].id })
    if (programId === null && programs[0]) store.setSource(source, { programId: programs[0].id })
    // setSource keeps the other choices, so this only fills what is missing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizSpots, programs])

  useEffect(() => {
    let stale = false
    if (heroName) {
      void ipcService.getRangeAdherence(heroName).then((result) => {
        if (!stale && result.success) setDeviationCount(result.data.deviations as number)
      })
    }
    return () => {
      stale = true
    }
  }, [heroName])

  // A new question whenever the source changes (and on the first visit).
  const sourceKey = `${source}-${spotId}-${programId}-${deviationScenarioId}`
  useEffect(() => {
    if (source === 'scenario' && spotId === null) return
    if (source === 'program' && programId === null) return
    void store.next(heroName)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, heroName])

  const choices = question?.choices ?? []
  const picked = choices.find((c) => c.actionId === pickedActionId)

  // The answer goes out once it is complete: the action, plus the answer to a raise when planned.
  useEffect(() => {
    if (question && picked && !verdict && (!needsResponse(picked) || pickedResponse)) void store.submit(heroName)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedActionId, pickedResponse])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName) || e.ctrlKey || e.metaKey || e.altKey) return
      const state = useTrainingStore.getState()
      if (state.verdict) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          void state.next(heroName)
        }
        return
      }
      const current = state.question
      if (!current) return
      const choice = choiceForKey(e.key, current.choices)
      if (choice) return state.pick(choice.actionId)
      const response = responseForKey(e.key)
      const chosen = current.choices.find((c) => c.actionId === state.pickedActionId)
      if (response && needsResponse(chosen)) state.pickResponse(response)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [heroName])

  const byId = useMemo(() => new Map(actions.map((a) => [a.id, a])), [actions])
  const matrix = useMemo(() => {
    const cells: Record<string, MatrixCell> = {}
    if (!verdict) return cells
    for (const [hand, id] of Object.entries(verdict.hands)) {
      const action = byId.get(id)
      if (!action) continue
      cells[hand] = { color: action.color, textColor: textColor(action.color), ...(hand === verdict.handClass ? { outline: 'focus' as const } : { dim: true }) }
    }
    return cells
  }, [verdict, byId])

  const villain = question?.table.seats.filter((s) => !s.isHero && s.action !== 'fold').pop() ?? question?.table.seats.find((s) => !s.isHero)
  const { right, total } = score(session)
  const position = Math.min(answered + (verdict ? 0 : 1), SESSION_LENGTH)
  const expected = verdict ? byId.get(verdict.expectedActionId) : undefined
  const answeredAction = verdict ? byId.get(verdict.answeredActionId) : undefined
  const part = verdict ? wrongPart(verdict) : 'none'

  const label = 'text-[13px] font-semibold text-gray-100'
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center gap-3">
        <div className="segmented">
          {SOURCES.map((value) => (
            <button key={value} aria-pressed={source === value} className={clsx('segmented-item', source === value && 'active')} onClick={() => store.setSource(value)}>
              {t(`ranges.training.sources.${value}`, { count: deviationCount ?? 0 })}
            </button>
          ))}
        </div>
        {source === 'scenario' && (
          <select className="select w-64" aria-label={t('ranges.training.scenario')} value={spotId ?? ''} onChange={(e) => store.setSource('scenario', { spotId: Number(e.target.value) })}>
            {quizSpots.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
        {source === 'program' && (
          <select className="select w-56" aria-label={t('ranges.training.program')} value={programId ?? ''} onChange={(e) => store.setSource('program', { programId: Number(e.target.value) })}>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-2 text-[13px] text-gray-100">
          <input type="checkbox" checked={store.prioritizeBorderline} onChange={(e) => store.setPrioritizeBorderline(e.target.checked)} />
          {t('ranges.training.borderline')}
        </label>
        <div className="ml-auto flex items-center gap-3 text-[13px] text-gray-400">
          <span>{t('ranges.training.question', { current: position, total: SESSION_LENGTH })}</span>
          <div className="h-1.5 w-40 rounded-full bg-dark-300" role="progressbar" aria-valuemin={0} aria-valuemax={SESSION_LENGTH} aria-valuenow={position}>
            <div className="h-full rounded-full bg-primary-500" style={{ width: `${(position / SESSION_LENGTH) * 100}%` }} />
          </div>
          <span className="font-mono">{t('ranges.training.score', { right, total })}</span>
        </div>
      </div>

      {empty && !loading && <div className="card p-10 text-center text-sm text-gray-400">{t(source === 'deviation' ? 'ranges.training.noDeviation' : 'ranges.training.nothing')}</div>}

      {question && (
        <div className="grid gap-[18px] lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className={clsx('flex flex-col gap-[18px] min-w-0', loading && 'opacity-60')}>
            <div className="card p-5">
              <div className="flex flex-wrap items-baseline gap-3 mb-3">
                <h2 className="text-xl font-bold text-gray-100">{question.name} · {formatDepth(question.stackBb)} bb</h2>
                <span className="text-[13px] text-gray-400">{t('ranges.training.whatDoYouDo')}</span>
              </div>
              <QuizTable question={question} />
            </div>

            <div className="card p-5 flex flex-col gap-3">
              <div>
                <div className={clsx(label, 'mb-2')}>{t('ranges.training.yourAction')}</div>
                <div className="flex flex-wrap gap-2">
                  {choices.map((choice, index) => {
                    const isPicked = choice.actionId === pickedActionId
                    const isExpected = verdict?.expectedActionId === choice.actionId
                    const wrongPick = verdict && isPicked && !verdict.immediateCorrect
                    return (
                      <button
                        key={choice.actionId}
                        disabled={verdict !== null}
                        aria-pressed={isPicked}
                        onClick={() => store.pick(choice.actionId)}
                        className={clsx(
                          'rounded-lg border-2 px-3 py-2 text-sm font-semibold uppercase text-gray-100 disabled:cursor-default',
                          wrongPick ? 'border-profit-negative' : isExpected && verdict ? 'border-primary-500' : isPicked ? 'border-gray-400' : 'border-dark-100 hover:border-gray-500',
                        )}
                        style={{ backgroundColor: `${choice.color}33` }}
                      >
                        <span className="mr-1.5 font-mono text-xs text-gray-400">{index + 1}</span>
                        {choice.label}
                        {wrongPick && <span className="ml-1.5 text-xs normal-case text-profit-negative">{t('ranges.training.yourAnswer')}</span>}
                        {isExpected && verdict && <span className="ml-1.5 text-xs normal-case text-primary-400">{t('ranges.training.yourRangeTag')}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <div className={clsx(label, 'mb-2')}>{t('ranges.training.ifRaised', { seat: villain?.position ?? '' })}</div>
                <div className="flex flex-wrap items-center gap-2">
                  {responseOptions(choices).map((option) => {
                    const enabled = needsResponse(picked) && verdict === null
                    const wrongAnswer = verdict && verdict.responseCorrect === false && pickedResponse === option
                    const expectedAnswer = verdict?.responseCorrect !== null && verdict?.expectedResponse === option
                    return (
                      <button
                        key={option}
                        disabled={!enabled}
                        aria-pressed={pickedResponse === option}
                        onClick={() => store.pickResponse(option)}
                        className={clsx(
                          'rounded-lg border-2 px-3 py-2 text-sm font-semibold uppercase disabled:opacity-40',
                          wrongAnswer ? 'border-profit-negative text-gray-100' : expectedAnswer && verdict ? 'border-primary-500 text-gray-100' : pickedResponse === option ? 'border-gray-400 text-gray-100' : 'border-dark-100 text-gray-400',
                        )}
                      >
                        {t(`ranges.responses.${option}`)}
                      </button>
                    )
                  })}
                  {!needsResponse(picked) && <span className="text-xs text-gray-500">{t('ranges.training.noFollowUp')}</span>}
                </div>
              </div>
              <p className="text-xs text-gray-500">{t('ranges.training.shortcuts')}</p>
            </div>
          </div>

          <div className="flex flex-col gap-[18px] min-w-0">
            {verdict ? (
              <div role="status" className={clsx('card p-5 flex flex-col gap-3 border-2', verdict.correct ? 'border-primary-500' : 'border-profit-negative')}>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-lg font-bold text-gray-100">{t(verdict.correct ? 'ranges.training.right' : 'ranges.training.wrong')}</h3>
                  <span className="font-mono text-sm text-gray-400">{verdict.handClass}</span>
                </div>
                {!verdict.correct && (
                  <p className="text-sm text-gray-400">
                    {t('ranges.training.rangeSays')} {expected && <ActionChip action={expected} />} {t('ranges.training.youAnswered')} {answeredAction && <ActionChip action={answeredAction} />}.
                    {part === 'response' && <span className="block mt-1">{t('ranges.training.responseWrong', { response: t(`ranges.responses.${verdict.expectedResponse ?? 'none'}`) })}</span>}
                  </p>
                )}
                {verdict.correct && expected && (
                  <p className="text-sm text-gray-400">
                    {t('ranges.training.rangeSays')} {<ActionChip action={expected} />}.
                  </p>
                )}
                {verdict.borderline && verdict.neighbor && <p className="text-sm text-gray-400">{t('ranges.training.borderlineNote', { neighbor: verdict.neighbor })}</p>}
                <RangeMatrix size="sm" cells={matrix} label={t('ranges.training.gridLabel', { hand: verdict.handClass })} />
                <div className="flex gap-2">
                  <button className="btn-secondary flex-1" onClick={() => question && onOpenRange(question.spotId, question.scenarioId)}>
                    {t('ranges.training.openRange')}
                  </button>
                  <button className="btn-primary flex-1" autoFocus onClick={() => void store.next(heroName)}>
                    {t('ranges.training.nextQuestion')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="card p-5 text-sm text-gray-500">{t('ranges.training.waiting')}</div>
            )}

            <div className="card p-5">
              <h3 className="text-[15px] font-semibold text-gray-100 mb-3">{t('ranges.training.thisSession')}</h3>
              <ul className="flex flex-wrap gap-2">
                {session.map((entry, index) => (
                  <li
                    key={`${index}-${entry.handClass}`}
                    className={clsx('rounded-lg border px-2 py-1 text-center', entry.correct ? 'border-primary-500 bg-primary-500/10' : 'border-profit-negative bg-profit-negative/10')}
                  >
                    <div className="font-mono text-xs font-bold text-gray-100">{entry.handClass}</div>
                    <div className="text-[10px] text-gray-400">{t(entry.correct ? 'ranges.training.rightShort' : 'ranges.training.wrongShort')}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
