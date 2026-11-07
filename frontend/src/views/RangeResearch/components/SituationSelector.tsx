import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Info, Layers, RotateCcw, Search, User, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import type { Json } from '@/services/ipcService'
import { useFilterStore } from '@/stores/filterStore'
import { usePlayersStore } from '@/stores/playersStore'

interface Situation {
  id: string
  situationId: string
  label: string
  /** Prior actions as "POSITION:action" pairs, in table order. */
  sequence: string[]
  positions: string[]
}

interface SituationSelectorProps {
  filters: Json
  /** Receives the full filter object with the changes applied. */
  onChange: (filters: Json) => void
}

const POSITION_NAMES: Record<string, string> = { BTN: 'Button / Dealer', SB: 'Small Blind', BB: 'Big Blind' }

function actionColorClass(action: string): string {
  if (action === 'raise') return 'text-profit-negative'
  if (action === 'call') return 'text-profit-positive'
  return 'text-info'
}

export default function SituationSelector({ filters, onChange }: SituationSelectorProps) {
  const { t } = useTranslation()
  const players = usePlayersStore((s) => s.players)
  const aliases = useFilterStore((s) => s.aliases)

  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedPosition, setSelectedPosition] = useState<string>(filters.Positions?.[0] || '')

  // Keep the highlighted position in sync when a preset is loaded from outside.
  useEffect(() => {
    if (filters.Positions?.[0]) setSelectedPosition(filters.Positions[0])
  }, [filters.Positions])

  const situations = useMemo(() => {
    const s = (id: string, sequence: string[], position: string): Situation => ({
      id, situationId: id, label: t(`range_analysis.situations.${id}`), sequence, positions: [position],
    })
    const table: Record<number, Record<string, Situation[]>> = {
      3: {
        BTN: [s('rfi', [], 'BTN'), s('limp', [], 'BTN')],
        SB: [s('sb_rfi', ['BTN:fold'], 'SB'), s('vs_btn_open', ['BTN:raise'], 'SB'), s('vs_btn_limp', ['BTN:call'], 'SB')],
        BB: [
          s('vs_btn_open_sb_fold', ['BTN:raise', 'SB:fold'], 'BB'),
          s('vs_sb_open', ['BTN:fold', 'SB:raise'], 'BB'),
          s('vs_btn_open_sb_call', ['BTN:raise', 'SB:call'], 'BB'),
          s('vs_sb_limp', ['BTN:fold', 'SB:call'], 'BB'),
          s('vs_btn_limp_sb_limp', ['BTN:call', 'SB:call'], 'BB'),
          s('vs_btn_limp_sb_fold', ['BTN:call', 'SB:fold'], 'BB'),
        ],
      },
      2: {
        SB: [s('hu_sb_rfi', [], 'SB'), s('hu_sb_limp', [], 'SB')],
        BB: [s('hu_vs_sb_open', ['SB:raise'], 'BB'), s('hu_vs_sb_limp', ['SB:call'], 'BB')],
      },
    }
    return table
  }, [t])

  const needle = searchTerm.toLowerCase()
  const filteredAliases = aliases.filter((a) => a.name.toLowerCase().includes(needle))
  const filteredPlayers = players.filter((p) => p.name.toLowerCase().includes(needle))
  const availablePositions = filters.PlayerCount === 2 ? ['SB', 'BB'] : ['BTN', 'SB', 'BB']
  const currentSituations = selectedPosition ? situations[filters.PlayerCount]?.[selectedPosition] || [] : []
  const currentSitId: string = filters.SituationId || ''
  const populationLabel = t('range_analysis.filters.population')

  const selectSituation = (sit: Situation) =>
    onChange({ ...filters, Positions: sit.positions, ActionSequence: sit.sequence, SituationId: sit.situationId })

  const changePosition = (pos: string) => {
    setSelectedPosition(pos)
    const first = situations[filters.PlayerCount]?.[pos]?.[0]
    if (first) selectSituation(first)
  }

  const changePlayerCount = (count: number) => {
    setSelectedPosition('')
    onChange({ ...filters, PlayerCount: count, Positions: [], ActionSequence: [], SituationId: '' })
  }

  const selectPlayer = (name: string) => {
    onChange({ ...filters, HeroName: name })
    setIsDropdownOpen(false)
  }

  const reset = () => {
    setSelectedPosition('')
    onChange({ ...filters, HeroName: undefined, MinStackBB: null, MaxStackBB: null, Positions: [], ActionSequence: [], SituationId: '' })
  }

  const option = (active: boolean, padding: string) =>
    clsx(padding, 'text-sm cursor-pointer rounded-lg mx-1 my-0.5 transition-colors flex items-center gap-3', active ? 'bg-primary-500/20 text-primary-400 font-bold' : 'text-gray-300 hover:bg-white/5')
  const sectionLabel = 'px-3 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-2'
  const stackInput = 'bg-transparent border-none p-0 text-sm text-gray-100 w-12 focus:ring-0 placeholder:text-gray-600 font-medium'

  const stepHeader = (n: number, label: string) => (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center text-[10px] font-bold text-onprimary">{n}</div>
      <h3 className="text-[15px] font-semibold text-gray-100">{label}</h3>
    </div>
  )

  return (
    <div className="bg-dark-400 rounded-[10px] p-5 flex flex-col gap-5 border border-dark-200 relative overflow-hidden">
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary-500/5 blur-3xl rounded-full" />

      <div className="flex flex-wrap items-center gap-6 pb-5 border-b border-dark-200">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-gray-500 uppercase tracking-[.06em]">{t('range_analysis.filters.table_size')}</span>
          <div className="flex bg-dark-400 rounded-lg p-1 border border-dark-200">
            {[2, 3].map((count) => (
              <button
                key={count}
                onClick={() => changePlayerCount(count)}
                className={clsx('px-4 py-1.5 text-xs font-bold rounded-md transition-all duration-200', filters.PlayerCount === count ? 'bg-primary-500 text-onprimary' : 'text-gray-400 hover:text-onprimary')}
              >
                {count === 2 ? 'Heads-Up' : '3-Max'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-gray-500 uppercase tracking-[.06em]">{t('range_analysis.filters.target_player')}</span>
          <div className="relative">
            <div
              className="flex items-center gap-3 cursor-pointer bg-dark-400 border border-dark-200 rounded-lg px-4 py-2 text-sm text-gray-100 hover:border-primary-500/50 transition-all min-w-[200px]"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              <User className="w-4 h-4 text-primary-400" />
              <span className="flex-1 truncate font-medium">{filters.HeroName || populationLabel}</span>
              <ChevronDown className={clsx('w-4 h-4 text-gray-500 transition-transform', isDropdownOpen && 'rotate-180')} />
            </div>

            {isDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />
                <div className="absolute top-full left-0 mt-2 w-72 bg-dark-300 border border-dark-200 rounded-lg shadow-xl z-50 flex flex-col max-h-80 overflow-hidden">
                  <div className="p-3 border-b border-dark-200 bg-dark-400/50">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="text"
                        autoFocus
                        placeholder={t('common.search')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-dark-500 border border-dark-200 rounded-lg pl-10 pr-4 py-2 text-xs text-gray-200 focus:outline-none focus:border-primary-500/50"
                      />
                    </div>
                  </div>
                  <div className="overflow-y-auto flex-1 p-1">
                    <div className={option(!filters.HeroName, 'px-4 py-3')} onClick={() => selectPlayer('')}>
                      <div className="w-8 h-8 rounded-full bg-primary-500/10 flex items-center justify-center"><Layers className="w-4 h-4" /></div>
                      <span>{populationLabel}</span>
                    </div>

                    {filteredAliases.length > 0 && <div className={sectionLabel}>{t('common.aliases', 'Aliases')}</div>}
                    {filteredAliases.map((a) => (
                      <div key={`alias-${a.id}`} className={option(filters.HeroName === a.name, 'px-4 py-2.5')} onClick={() => selectPlayer(a.name)}>
                        <div className="w-8 h-8 rounded-full bg-primary-500/10 flex items-center justify-center text-primary-400 border border-primary-500/20"><Users className="w-4 h-4" /></div>
                        <div className="flex flex-col">
                          <span>{a.name}</span>
                          <span className="text-[10px] text-gray-500 font-normal">{a.players.length} {t('common.players')}</span>
                        </div>
                      </div>
                    ))}

                    {filteredPlayers.length > 0 && <div className={sectionLabel}>{t('common.players')}</div>}
                    {filteredPlayers.map((p) => (
                      <div key={p.name} className={option(filters.HeroName === p.name, 'px-4 py-2.5')} onClick={() => selectPlayer(p.name)}>
                        <div className="w-8 h-8 rounded-full bg-dark-500 flex items-center justify-center text-[10px] font-bold text-gray-400 border border-dark-200">
                          {p.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span>{p.name}</span>
                          <span className="text-[10px] text-gray-500 font-normal">{(p.total_hands || 0).toLocaleString()} {t('common.hands')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-gray-500 uppercase tracking-[.06em]">{t('range_analysis.filters.stack_depth')}</span>
          <div className="flex items-center gap-2 bg-dark-400 border border-dark-200 rounded-lg px-3 py-1.5">
            <Layers className="w-4 h-4 text-gray-500" />
            <input type="number" placeholder="Min" value={filters.MinStackBB ?? ''} onChange={(e) => onChange({ ...filters, MinStackBB: e.target.value ? parseFloat(e.target.value) : null })} className={stackInput} />
            <span className="text-gray-600">to</span>
            <input type="number" placeholder="Max" value={filters.MaxStackBB ?? ''} onChange={(e) => onChange({ ...filters, MaxStackBB: e.target.value ? parseFloat(e.target.value) : null })} className={stackInput} />
          </div>
        </div>

        <button onClick={reset} className="mt-5 ml-auto text-xs text-gray-500 hover:text-gray-100 flex items-center gap-2 transition-colors group">
          <RotateCcw className="w-3.5 h-3.5 group-hover:-rotate-45 transition-transform" />
          {t('range_analysis.filters.reset')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_3fr] gap-6">
        <div className="flex flex-col gap-4">
          {stepHeader(1, t('range_analysis.filters.position'))}
          <div className="grid grid-cols-1 gap-2">
            {availablePositions.map((pos) => (
              <button
                key={pos}
                onClick={() => changePosition(pos)}
                className={clsx(
                  'flex items-center justify-between px-5 py-4 rounded-lg border transition-all duration-200 text-left',
                  selectedPosition === pos ? 'bg-primary-500/10 border-primary-500 text-primary-400 shadow-lg shadow-primary-500/5' : 'bg-dark-400/50 border-dark-200 text-gray-400 hover:border-dark-200 hover:bg-dark-400',
                )}
              >
                <div className="flex flex-col">
                  <span className="text-lg font-bold">{pos}</span>
                  <span className="text-[10px] opacity-60 uppercase tracking-tighter">{POSITION_NAMES[pos]}</span>
                </div>
                {selectedPosition === pos && <div className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {stepHeader(2, t('range_analysis.filters.situation'))}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {currentSituations.map((sit) => {
              const active = currentSitId === sit.situationId
              return (
                <button
                  key={sit.id}
                  onClick={() => selectSituation(sit)}
                  className={clsx(
                    'flex flex-col gap-2 p-4 rounded-lg border transition-all duration-200 text-left relative overflow-hidden group',
                    active ? 'bg-white/5 border-primary-500/50 text-gray-100' : 'bg-dark-400/50 border-dark-200 text-gray-400 hover:border-white/20 hover:bg-dark-400',
                  )}
                >
                  {active && (
                    <div className="absolute top-0 right-0 p-1">
                      <div className="bg-primary-500 text-[8px] font-black px-1.5 py-0.5 rounded text-onprimary uppercase">{t('range_analysis.filters.active')}</div>
                    </div>
                  )}
                  <span className={clsx('text-sm font-bold transition-colors', active ? 'text-primary-400' : 'group-hover:text-gray-200')}>{sit.label}</span>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {sit.sequence.length === 0 && (
                      <span className="text-[9px] bg-green-500/10 text-profit-positive px-2 py-0.5 rounded border border-green-500/20 font-bold uppercase">{t('range_analysis.filters.first_to_act')}</span>
                    )}
                    {sit.sequence.map((step, i) => {
                      const [who, what] = step.split(':')
                      return (
                        <div key={i} className="flex items-center gap-1">
                          <div className="flex items-center gap-1 bg-dark-500 px-2 py-0.5 rounded border border-dark-200">
                            <span className="text-[9px] font-bold text-gray-300">{who}</span>
                            <span className={clsx('text-[9px] font-black uppercase', actionColorClass(what))}>{what}</span>
                          </div>
                          {i < sit.sequence.length - 1 && <span className="text-[10px] text-gray-600">→</span>}
                        </div>
                      )
                    })}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-500 bg-blue-500/5 border border-primary-500/10 p-3 rounded-lg">
            <Info className="w-4 h-4 text-info shrink-0" />
            <div>
              {selectedPosition
                ? t('range_analysis.filters.info_tip', { position: selectedPosition, player: filters.HeroName || populationLabel })
                : t('range_analysis.filters.info_tip_empty')}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
