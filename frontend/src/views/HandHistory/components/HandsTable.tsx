import { ArrowUpDown, Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import CardTile from '@/components/common/CardTile'
import type { Json } from '@/services/ipcService'
import { parseCards } from '@/utils/formatters'

interface HandsTableProps {
  hands: Json[]
  selectedHand: Json | null
  sortBy: string
  onSelectHand: (handId: string | number) => void
  onReplayHand: (handId: string | number) => void
  onSort: (sortBy: string) => void
}

const handProfit = (hand: Json): number => hand.hero_profit || hand.dyn_hero_profit || 0
const handCev = (hand: Json): number => (hand.ev_chips !== null && hand.ev_chips !== undefined ? hand.ev_chips : handProfit(hand))
const signedClass = (value: number) => (value > 0 ? 'text-profit-positive/80' : value < 0 ? 'text-profit-negative/80' : 'text-gray-500')

function formatHandTime(dateTime: string): string {
  const date = new Date(dateTime)
  const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return `${dateStr} ${timeStr}`
}

export default function HandsTable({ hands, selectedHand, sortBy, onSelectHand, onReplayHand, onSort }: HandsTableProps) {
  const { t } = useTranslation()

  const handleSort = (field: string) => onSort(sortBy === `${field}_desc` ? `${field}_asc` : `${field}_desc`)
  const sortIcon = (field: string) => (
    <ArrowUpDown className={clsx('w-3 h-3', sortBy?.startsWith(field) ? 'text-primary-400' : 'text-gray-600')} />
  )

  return (
    <div className="overflow-x-auto">
      <table className="table w-full text-xs">
        <thead className="text-gray-500 border-b border-dark-200">
          <tr>
            <th className="px-4 py-2 text-left cursor-pointer hover:bg-dark-300" onClick={() => handleSort('date')}>
              <div className="flex items-center gap-1">{t('common.date')}{sortIcon('date')}</div>
            </th>
            <th className="px-4 py-2 text-left">{t('common.cards')}</th>
            <th className="px-4 py-2 text-left">{t('common.position')}</th>
            <th className="px-4 py-2 text-right cursor-pointer hover:bg-dark-300" onClick={() => handleSort('cev')}>
              <div className="flex items-center justify-end gap-1">CEV{sortIcon('cev')}</div>
            </th>
            <th className="px-4 py-2 text-right cursor-pointer hover:bg-dark-300" onClick={() => handleSort('profit')}>
              <div className="flex items-center justify-end gap-1">{t('common.result')}{sortIcon('profit')}</div>
            </th>
            <th className="px-4 py-2 text-center w-12" />
          </tr>
        </thead>
        <tbody>
          {hands.map((hand) => {
            const cev = handCev(hand)
            const profit = handProfit(hand)
            return (
              <tr
                key={hand.id}
                className={clsx('hover:bg-primary-500/5 cursor-pointer border-b border-dark-200 last:border-0', selectedHand?.id === hand.id && 'bg-primary-500/10')}
                onClick={() => onSelectHand(hand.id)}
              >
                <td className="px-4 py-2 text-gray-500">{formatHandTime(hand.date_time)}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-[3px] items-center">
                    {parseCards(hand.hero_cards || hand.dyn_hero_cards).map((c, i) => <CardTile key={i} card={c} />)}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <span className="px-1.5 py-0.5 rounded bg-dark-300 text-[10px] text-gray-400">{hand.hero_position || hand.dyn_hero_position}</span>
                </td>
                <td className={clsx('px-4 py-2 text-right font-mono', signedClass(cev))}>
                  {`${cev > 0 ? '+' : ''}${cev.toFixed(1)}`}
                </td>
                <td className={clsx('px-4 py-2 text-right font-semibold', signedClass(profit))}>
                  {`${profit > 0 ? '+' : ''}${profit.toFixed(0)}`}
                </td>
                <td className="px-4 py-2 text-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); onReplayHand(hand.id) }}
                    className="p-1 rounded hover:bg-primary-500/20 text-gray-500 hover:text-primary-400 transition-all"
                    title={t('common.replay_hand')}
                  >
                    <Play style={{ width: 12, height: 12 }} fill="currentColor" />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
