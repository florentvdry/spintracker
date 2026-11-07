import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, FastForward, List, Pause, Play, Rewind, SkipBack, SkipForward, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import type { Json } from '@/services/ipcService'
import { isRealAction, selectCurrentAction, selectDoneActions, selectTotalActions, useReplayerStore } from '@/stores/replayerStore'
import PokerTable from './PokerTable'
import './replayer.css'

const SPEEDS = [
  { label: '0.5x', value: 2000 },
  { label: '1x', value: 1000 },
  { label: '2x', value: 500 },
  { label: '4x', value: 250 },
]
// The action log opens by default only on wide windows.
const LOG_DEFAULT_MIN_WIDTH = 1180

const ACTION_TYPE_COLOR: Record<string, string> = {
  Fold: 'text-profit-negative',
  Check: 'text-gray-400',
  Call: 'text-blue-400',
  Bet: 'text-blue-400',
  Raise: 'text-profit-positive',
  AllIn: 'text-orange-400',
}

export default function Replayer() {
  const { t } = useTranslation()
  const store = useReplayerStore()
  const currentAction = useReplayerStore(selectCurrentAction)
  const totalActions = useReplayerStore(selectTotalActions)
  const doneActions = useReplayerStore(selectDoneActions)
  const [showLogs, setShowLogs] = useState(() => window.innerWidth >= LOG_DEFAULT_MIN_WIDTH)

  const { handData, currentIndex, isPlaying, nextStep, prevStep, play, stop } = store

  const actions: Json[] = handData?.actions ?? []
  const realActions = actions.map((action, index) => ({ action, index })).filter((entry) => isRealAction(entry.action))

  // `currentIndex` is the number of actions applied, so the last one played sits right before it.
  const lastPlayedIndex = currentIndex - 1

  const togglePlay = () => (isPlaying ? stop() : play())

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === ' ') {
        event.preventDefault()
        const { isPlaying: playing, play: start, stop: pause } = useReplayerStore.getState()
        if (playing) pause()
        else start()
      } else if (event.key === 'ArrowRight') {
        useReplayerStore.getState().nextStep()
      } else if (event.key === 'ArrowLeft') {
        useReplayerStore.getState().prevStep()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      useReplayerStore.getState().stop()
    }
  }, [])

  return (
    <div className="replayer-page">
      <header className="replayer-header">
        {handData ? (
          <div className="hand-card">
            <div className="hand-title">
              <span>{handData.room}</span>
              <span className="hand-buyin">{handData.buyIn} EUR</span>
            </div>
            <div className="hand-meta">
              <span>{handData.date}</span>
              {handData.blinds && <span>Blinds {handData.blinds}</span>}
            </div>
          </div>
        ) : (
          <div className="hand-card">
            <div className="hand-title">{t('replayer.title')}</div>
            <div className="hand-meta">{t('replayer.no_hand')}</div>
          </div>
        )}

        {store.handQueue.length > 1 && (
          <div className="queue-card">
            <button className="icon-button" disabled={store.queueIndex === 0} onClick={() => void store.prevHand()}><ChevronLeft size={18} /></button>
            <span>{t('replayer.hand_of', { current: store.queueIndex + 1, total: store.handQueue.length })}</span>
            <button className="icon-button" disabled={store.queueIndex >= store.handQueue.length - 1} onClick={() => void store.nextHand()}><ChevronRight size={18} /></button>
          </div>
        )}

        <button className={clsx('log-toggle', showLogs && 'active')} onClick={() => setShowLogs(!showLogs)}>
          <List size={18} />
          <span>{t('replayer.actions')}</span>
        </button>
      </header>

      <main className={clsx('replayer-main', showLogs && 'with-log')}>
        <section className="table-panel">
          {store.loading && <div className="loading-cover"><div className="spinner" /></div>}

          {handData ? (
            <PokerTable />
          ) : (
            !store.loading && (
              <div className="empty-state">
                <h2>{t('replayer.empty_title')}</h2>
                <p>{t('replayer.empty_text')}</p>
              </div>
            )
          )}
        </section>

        {showLogs && (
          <aside className="action-panel">
            <div className="panel-header">
              <div>
                <span className="eyebrow">{t('replayer.timeline')}</span>
                <h2>{t('replayer.actions')}</h2>
              </div>
              <button className="icon-button" onClick={() => setShowLogs(false)}><X size={17} /></button>
            </div>

            <div className="action-list">
              {realActions.map(({ action, index }) => (
                <button
                  key={`${index}-${action.description}`}
                  className={clsx('action-row', index < lastPlayedIndex && 'played', index === lastPlayedIndex && 'current')}
                  onClick={() => store.jumpToAction(index)}
                >
                  <span className="action-street">{action.street || '-'}</span>
                  <span className={clsx('action-description', ACTION_TYPE_COLOR[action.type] ?? 'text-gray-400')}>{action.description}</span>
                  <span className="action-order">#{action.order}</span>
                </button>
              ))}
            </div>
          </aside>
        )}
      </main>

      <footer className="control-panel">
        <div className="current-action">
          <span className="current-label">{t('replayer.current_action')}</span>
          <strong>{currentAction && isRealAction(currentAction) ? currentAction.description : t('replayer.ready')}</strong>
        </div>

        <div className="progress-row">
          <span>{doneActions}</span>
          <input
            type="range"
            min={0}
            max={totalActions}
            value={doneActions}
            className="progress-slider"
            onChange={(e) => store.jumpToProgress(Number(e.target.value))}
          />
          <span>{totalActions}</span>
        </div>

        <div className="controls-row">
          <div className="playback-group">
            <button className="control-button" onClick={store.resetTable}><Rewind size={20} /></button>
            <button className="control-button" onClick={prevStep}><SkipBack size={20} /></button>
            <button className="play-button" onClick={togglePlay}>{isPlaying ? <Pause size={26} /> : <Play size={26} className="ml-0.5" />}</button>
            <button className="control-button" onClick={nextStep}><SkipForward size={20} /></button>
            <button className="control-button" onClick={() => store.jumpToProgress(totalActions)}><FastForward size={20} /></button>
          </div>

          <div className="toggle-group" aria-label={t('replayer.display_mode')}>
            <button className={clsx(store.viewMode === 'chips' && 'active')} onClick={() => store.setViewMode('chips')}>Chips</button>
            <button className={clsx(store.viewMode === 'bb' && 'active')} onClick={() => store.setViewMode('bb')}>BB</button>
          </div>

          <div className="toggle-group" aria-label={t('replayer.speed')}>
            {SPEEDS.map((speed) => (
              <button key={speed.value} className={clsx(store.playbackSpeed === speed.value && 'active')} onClick={() => store.setSpeed(speed.value)}>
                {speed.label}
              </button>
            ))}
          </div>

          <div className="toggle-group" aria-label={t('replayer.options')}>
            <button className={clsx(store.showFoldedPlayers && 'active')} onClick={() => store.setShowFoldedPlayers(!store.showFoldedPlayers)}>
              <span className="toggle-icon">👥</span>
              {t('replayer.folded')}
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}
