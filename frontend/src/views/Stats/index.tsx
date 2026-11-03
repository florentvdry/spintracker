import { useEffect, useMemo, useState } from 'react'
import { Sigma } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { ipcService, type Json } from '@/services/ipcService'
import { buyInParam, currentDateRange, useFilterStore } from '@/stores/filterStore'
import { useReplayerStore } from '@/stores/replayerStore'
import { HudMatrix, HudMiniTable, HudPostflopBox, HudStatLine, type OpenHands } from './components/HudParts'
import {
  buildHudDetail, compactActions, compactNumber, createHudModel, fmt, formatChips, formatHandDate, formatStake,
  hudMenuItems, parseBlinds, splitCards,
} from './hudModel'
import './stats.css'

const LOAD_DEBOUNCE_MS = 300
const OPPONENT_LIMIT = 5000

type StatsScope = 'population' | 'reg' | 'fish' | 'player'

const CARD_TONES: Record<string, string> = { h: 'heart', d: 'diamond', c: 'club' }
const cardTone = (card: string) => CARD_TONES[card.trim().slice(-1).toLowerCase()] ?? 'spade'
const cardRank = (card: string) => {
  const clean = card.trim()
  return (clean.length > 1 ? clean.slice(0, -1) : clean).toUpperCase()
}

function CardRow({ cards, board }: { cards: string | undefined; board?: boolean }) {
  return (
    <div className={clsx('card-row', board && 'board')}>
      {splitCards(cards).map((card) => (
        <span key={card} className={clsx('card-tile', cardTone(card))}>{cardRank(card)}</span>
      ))}
    </div>
  )
}

export default function Stats() {
  const { t } = useTranslation()
  const heroName = useFilterStore((s) => s.heroName)
  const buyIn = useFilterStore((s) => s.buyIn)
  const dateRange = useFilterStore((s) => s.dateRange)
  const customFrom = useFilterStore((s) => s.customDateFrom)
  const customTo = useFilterStore((s) => s.customDateTo)
  const selectedSession = useFilterStore((s) => s.selectedSession)
  const aliases = useFilterStore((s) => s.aliases)
  const fetchAliases = useFilterStore((s) => s.fetchAliases)
  const openSingleHandReplayer = useReplayerStore((s) => s.openSingleHandReplayer)

  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<Json | null>(null)
  const [statsScope, setStatsScope] = useState<StatsScope>('population')
  const [selectedOpponent, setSelectedOpponent] = useState<string | null>(null)
  const [opponents, setOpponents] = useState<Json[]>([])
  const [opponentSearch, setOpponentSearch] = useState('')
  const [activeHudPopup, setActiveHudPopup] = useState<string>('General')
  const [hudDetail, setHudDetail] = useState<ReturnType<typeof buildHudDetail>>(null)

  useEffect(() => {
    void fetchAliases()
  }, [fetchAliases])

  // Opponent list for the "specific player" profile.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await ipcService.getPlayers({ limit: OPPONENT_LIMIT })
      if (!cancelled) setOpponents(res?.success && Array.isArray(res.data) ? res.data : [])
      await fetchAliases()
    })()
    return () => {
      cancelled = true
    }
  }, [heroName, fetchAliases])

  useEffect(() => {
    if (statsScope !== 'player') setSelectedOpponent(null)
  }, [statsScope])

  // Reload (debounced) whenever any filter changes.
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      if (statsScope === 'player' && !selectedOpponent) {
        setStats(null)
        return
      }
      setLoading(true)
      try {
        const { dateFrom, dateTo } = currentDateRange()
        const res = await ipcService.getDetailedStats(
          heroName, dateFrom, dateTo, buyInParam(buyIn), statsScope, statsScope === 'player' ? selectedOpponent : null,
        )
        if (!cancelled) setStats(res?.success ? res.data || null : null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, LOAD_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [heroName, buyIn, dateRange, customFrom, customTo, selectedSession, statsScope, selectedOpponent])

  const model = useMemo(() => createHudModel(stats), [stats])
  const needle = opponentSearch.toLowerCase()
  const aliasOptions = aliases.filter((a) => a?.name && a.name.toLowerCase().includes(needle))
  const opponentOptions = opponents.filter((p) => p?.name && p.name.toLowerCase().includes(needle))

  const scopeLabel =
    statsScope === 'reg' ? t('stats.scope_regs')
    : statsScope === 'fish' ? t('stats.scope_fishs')
    : statsScope === 'player' ? selectedOpponent || t('stats.scope_player')
    : t('stats.scope_population')

  const panel: Json = model.spotDefinitions[activeHudPopup] || model.spotDefinitions['3max-BTN']
  const openHands: OpenHands = (label, value, context) => setHudDetail(buildHudDetail(label, value, context))
  const replayHand = (hand: Json) => {
    if (hand?.id) void openSingleHandReplayer(hand.id, hand.playerName || heroName)
  }

  return (
    <div className="stats-page">
      <header className="hero-panel">
        <div className="page-title-block">
          <div className="page-icon"><Sigma className="w-6 h-6" /></div>
          <div>
            <h1>{t('stats.title')}</h1>
            <p className="subtitle">{t('stats.subtitle')}</p>
          </div>
        </div>
        <div className="scope-summary">
          <span>{scopeLabel}</span>
          <strong>{fmt(stats?.meta?.player_hands)}</strong>
          <small>{t('common.player_lines')}</small>
        </div>
      </header>

      <section className="filter-panel">
        <label className="field">
          <span>{t('stats.profile_label')}</span>
          <select value={statsScope} onChange={(e) => setStatsScope(e.target.value as StatsScope)}>
            <option value="population">{t('stats.scope_population')}</option>
            <option value="reg">{t('stats.scope_regs')}</option>
            <option value="fish">{t('stats.scope_fishs')}</option>
            <option value="player">{t('stats.scope_player')}</option>
          </select>
        </label>

        {statsScope === 'player' && (
          <label className="field player-field">
            <span>{t('stats.player_label')}</span>
            <input type="text" value={opponentSearch} onChange={(e) => setOpponentSearch(e.target.value)} placeholder={t('stats.search_player')} />
            <select value={selectedOpponent ?? ''} onChange={(e) => setSelectedOpponent(e.target.value || null)}>
              <option value="">{t('stats.select_player')}</option>
              {aliasOptions.length > 0 && (
                <optgroup label={t('common.aliases')}>
                  {aliasOptions.map((a) => <option key={`alias-${a.id}`} value={a.name}>{a.name} ({t('stats.alias_suffix')})</option>)}
                </optgroup>
              )}
              <optgroup label={t('common.players')}>
                {opponentOptions.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
              </optgroup>
            </select>
          </label>
        )}
      </section>

      {loading ? (
        <div className="state-card">{t('stats.loading')}</div>
      ) : !stats ? (
        <div className="state-card">{t('stats.no_data')}</div>
      ) : (
        <section className="hud-popup-screen">
          <aside className="hud-menu">
            {hudMenuItems.map((item) => (
              <button key={item} className={clsx(item === activeHudPopup && 'active')} onClick={() => setActiveHudPopup(item)}>{item}</button>
            ))}
          </aside>

          {activeHudPopup === 'General' ? (
            <div className="general-popup">
              <div className="general-left">
                <div className="total-block">
                  <div className="total-title">TOTAL</div>
                  <div className="total-row"><span>Hands [3max]</span><strong>{compactNumber(model.hudHands.threeMax)}</strong></div>
                  <div className="total-row"><span>Hands [HU]</span><strong>{compactNumber(model.hudHands.hu)}</strong></div>
                </div>

                <HudMiniTable title="Aggr [3max]" headers={['Flop', 'Turn', 'River']} rows={model.aggr3MaxRows} onOpen={openHands} />
                <HudMiniTable title="Bet River [3max]" headers={['%', 'W$SD']} rows={model.betRiver3MaxRows} onOpen={openHands} />
                <HudMiniTable title="Vs Bet River [3max]" headers={['Call', 'Fold']} rows={model.vsBetRiver3MaxRows} onOpen={openHands} />
                <HudMiniTable title="Aggr [HU]" headers={['Flop', 'Turn', 'River']} rows={model.aggrHuRows} colorful onOpen={openHands} />
                <HudMiniTable title="Bet River [HU]" headers={['%', 'W$SD']} rows={model.betRiverHuRows} colorful onOpen={openHands} />
                <HudMiniTable title="Vs Bet River [HU]" headers={['Call', 'Fold']} rows={model.vsBetRiverHuRows} colorful onOpen={openHands} />
              </div>

              <div className="general-right">
                <div className="hud-columns">
                  <div />
                  <div className="hud-group">3 max</div>
                  <div className="hud-group hu-group">HU</div>
                  <div />
                  <div />
                  <div className="hud-pos sb">SB</div>
                  <div className="hud-pos bb">BB</div>
                </div>

                <div className="hud-stat-list">
                  {model.generalPreflopRows.map((row: Json) => <HudStatLine key={row.label} row={row} onOpen={openHands} />)}
                </div>
                <div className="hud-stat-list separated">
                  {model.generalLimpRows.map((row: Json) => <HudStatLine key={row.label} row={row} onOpen={openHands} />)}
                </div>
                <div className="hud-stat-list separated">
                  {model.generalPostflopRows.map((row: Json) => <HudStatLine key={row.label} row={row} onOpen={openHands} />)}
                </div>
                <div className="hud-stat-list separated">
                  {model.generalShowdownRows.map((row: Json) => <HudStatLine key={row.label} row={row} onOpen={openHands} />)}
                </div>
              </div>
            </div>
          ) : (
            <div className={clsx('spot-popup', panel.theme)}>
              <div className="spot-top">
                <div className="spot-hands">
                  <span>{panel.handsLabel}</span>
                  <strong>{compactNumber(panel.hands)}</strong>
                </div>
                <HudMiniTable title="Aggression" headers={['Flop', 'Turn', 'River']} rows={panel.aggressionRows} onOpen={openHands} />
                <HudMiniTable title={panel.betRiverTitle} headers={['%', 'W$SD']} rows={panel.betRiverRows} onOpen={openHands} />
                <HudMiniTable title={panel.vsBetRiverTitle} headers={['Call', 'Fold']} rows={panel.vsBetRiverRows} onOpen={openHands} />
              </div>

              <div className="spot-title">{panel.title}</div>
              <HudMatrix headers={panel.matrixHeaders} rows={panel.matrixRows} onOpen={openHands} />

              {panel.secondaryTitle && <div className="spot-title secondary">{panel.secondaryTitle}</div>}
              {panel.secondaryRows?.length > 0 && <HudMatrix headers={panel.secondaryHeaders} rows={panel.secondaryRows} onOpen={openHands} />}

              <div className={clsx('spot-postflop', panel.sideBoxes && 'compact')}>
                {panel.postflopBoxes.map((box: Json) => <HudPostflopBox key={box.title} box={box} onOpen={openHands} />)}
              </div>

              {panel.sideBoxes && (
                <aside className="spot-side-boxes">
                  {panel.sideBoxes.map((box: Json) => <HudPostflopBox key={box.title} box={box} onOpen={openHands} />)}
                </aside>
              )}
            </div>
          )}
        </section>
      )}

      {hudDetail && (
        <div className="stat-hands-backdrop" onClick={() => setHudDetail(null)}>
          <article className="stat-hands-panel" onClick={(e) => e.stopPropagation()}>
            <header className="stat-hands-header">
              <div>
                <p className="eyebrow">{hudDetail.context || t('stats.occurrences')}</p>
                <h2>{hudDetail.label}</h2>
                <p>{hudDetail.definition}</p>
              </div>
              <div className="stat-hands-sample">
                <strong>{hudDetail.sample?.num ?? 0}</strong>
                <span>/ {hudDetail.sample?.den ?? 0} {t('common.opportunities')}</span>
              </div>
              <button className="modal-close" onClick={() => setHudDetail(null)}>{t('common.close')}</button>
            </header>

            {!hudDetail.hands?.length ? (
              <div className="empty-hands">{t('stats.no_occurrences')}</div>
            ) : (
              <div className="stat-hands-table-wrap">
                <table className="stat-hands-table">
                  <thead>
                    <tr>
                      <th>Preflop</th><th>Actions</th><th>Flop</th><th>Actions</th><th>Turn</th><th>Actions</th><th>River</th><th>Actions</th>
                      <th>{t('common.stakes')}</th><th>{t('common.won')}</th><th>{t('common.date')}</th><th>{t('common.replay_hand')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hudDetail.hands.map((hand: Json) => {
                      const bb = parseBlinds(hand.blinds)?.bb || 1
                      return (
                        <tr key={`${hand.id}-${hand.playerName}`} onDoubleClick={() => replayHand(hand)}>
                          <td><CardRow cards={hand.cards} /></td>
                          <td className="action-cell">{compactActions(hand.preflop, bb)}</td>
                          <td><CardRow cards={hand.flopCards} board /></td>
                          <td className="action-cell">{compactActions(hand.flop, bb)}</td>
                          <td><CardRow cards={hand.turnCard} board /></td>
                          <td className="action-cell">{compactActions(hand.turn, bb)}</td>
                          <td><CardRow cards={hand.riverCard} board /></td>
                          <td className="action-cell">{compactActions(hand.river, bb)}</td>
                          <td>{formatStake(hand)}</td>
                          <td className={clsx('profit-cell', Number(hand.netProfit || 0) >= 0 ? 'win' : 'loss')}>{formatChips(hand.netProfit)}</td>
                          <td>{formatHandDate(hand.dateTime)}</td>
                          <td><button className="replay-button" onClick={(e) => { e.stopPropagation(); replayHand(hand) }}>{t('common.replay_hand')}</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </div>
      )}
    </div>
  )
}
