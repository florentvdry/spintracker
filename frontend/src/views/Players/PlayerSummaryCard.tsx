import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { ipcService } from '@/services/ipcService'
import { logError } from '@/utils/log'

const NOTE_MAX_CHARS = 2000

interface Summary {
  games: number
  hands: number
  cev: number
  cevPerGame: number
  firstPlayedAt: string | null
  lastPlayedAt: string | null
  autoTags: string[]
  note: string
  tag: string
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: number }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className={clsx('mt-0.5 font-mono text-base font-semibold', tone === undefined ? 'text-gray-100' : tone >= 0 ? 'text-profit-positive' : 'text-profit-negative')}>{value}</div>
    </div>
  )
}

/** The history against one player: games shared, the hero's chip EV against them, tags and the note. */
export default function PlayerSummaryCard({ heroName, name, room }: { heroName: string; name: string; room: string }) {
  const { t } = useTranslation()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSummary(null)
    void ipcService
      .getPlayerSummary({ heroName, name, room })
      .then((result) => {
        if (cancelled || !result.success) return
        setSummary(result.data as Summary)
        setNote((result.data as Summary).note)
      })
      .catch((error: unknown) => logError('Failed to load the player summary:', error))
    return () => {
      cancelled = true
    }
  }, [heroName, name, room])

  const saveNote = async () => {
    if (!summary || !room) return
    const result = await ipcService.saveHudNote({ room, playerName: name, note, tag: summary.tag })
    setSaved(result.success)
    if (result.success) window.setTimeout(() => setSaved(false), 2000)
  }

  if (!summary) return null
  const cev = summary.cev
  return (
    <div className="border-b border-dark-200 p-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Figure label={t('players.summary.games')} value={String(summary.games)} />
        <Figure label={t('players.summary.hands')} value={String(summary.hands)} />
        <Figure label={t('players.summary.cev')} value={`${cev >= 0 ? '+' : ''}${cev.toFixed(0)}`} tone={cev} />
        <Figure label={t('players.summary.cev_per_game')} value={`${summary.cevPerGame >= 0 ? '+' : ''}${summary.cevPerGame.toFixed(1)}`} tone={summary.cevPerGame} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-400">
        <span>{t('players.summary.tags')}</span>
        {summary.autoTags.length === 0 && <span className="text-gray-600">–</span>}
        {summary.autoTags.map((tag) => (
          <span key={tag} className="rounded-full bg-dark-300 px-2.5 py-0.5 font-medium text-gray-200">{tag}</span>
        ))}
        {summary.firstPlayedAt && summary.lastPlayedAt && (
          <span className="ml-auto font-mono">{summary.firstPlayedAt.slice(0, 10)} → {summary.lastPlayedAt.slice(0, 10)}</span>
        )}
      </div>
      {room && (
        <div className="mt-3 flex items-start gap-2">
          <textarea
            className="input min-h-[56px] flex-1 text-xs"
            maxLength={NOTE_MAX_CHARS}
            placeholder={t('players.summary.note_placeholder')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button className="btn-secondary text-xs" disabled={note === summary.note && !saved} onClick={() => void saveNote()}>
            {saved ? t('players.summary.saved') : t('players.summary.save_note')}
          </button>
        </div>
      )}
    </div>
  )
}
