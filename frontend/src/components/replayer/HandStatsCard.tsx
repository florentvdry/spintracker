import { useTranslation } from 'react-i18next'
import { AT_HAND_STATS, formatStatPct, type StatsAtHand } from '@/utils/replayerHud'

/** The stats of each player as they were before the replayed hand. */
export default function HandStatsCard({ stats }: { stats: StatsAtHand }) {
  const { t } = useTranslation()
  return (
    <section className="hand-stats-card">
      <h3>{t('replayer.at_hand_title')}</h3>
      <table>
        <thead>
          <tr>
            <th>{t('replayer.at_hand_player')}</th>
            <th>{t('replayer.at_hand_hands')}</th>
            {AT_HAND_STATS.map((stat) => (
              <th key={stat.label}>{stat.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stats.players.map((player) => (
            <tr key={player.name}>
              <td title={player.name}>{player.name}</td>
              <td>{player.hands}</td>
              {player.stats.map((stat, index) => (
                <td key={AT_HAND_STATS[index]?.label ?? index}>{formatStatPct(stat.pct)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
