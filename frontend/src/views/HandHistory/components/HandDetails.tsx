import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import CardTile from '@/components/common/CardTile'
import type { Json } from '@/services/ipcService'
import { parseCards } from '@/utils/formatters'
import ActionBlock from './ActionBlock'
import InfoRow from './InfoRow'

interface HandDetailsProps {
  hand: Json
  onClose: () => void
}

export default function HandDetails({ hand, onClose }: HandDetailsProps) {
  const { t } = useTranslation()

  const profit: number = hand?.hero_profit || 0
  const isPositive = profit >= 0
  const ev: number = hand?.ev_chips !== null && hand?.ev_chips !== undefined ? hand.ev_chips : profit

  const villain = hand?.players?.find((p: Json) => !p.IsHero)
  const villainPosition = hand?.villain_position || villain?.Position || '—'
  const villainCards: string = hand?.villain_cards || villain?.Cards || '—'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex gap-[3px] items-center">
            {parseCards(hand.hero_cards).map((c, i) => <CardTile key={i} card={c} size="lg" />)}
          </div>
          <p className="text-xs text-gray-400">{hand.date_time}</p>
        </div>
        <button onClick={onClose} className="btn-icon"><X className="w-4 h-4" /></button>
      </div>

      <div className="p-4 bg-dark-300 rounded-lg text-center">
        <p className="stat-label mb-1">{t('common.result')}</p>
        <p className={clsx('font-mono text-[28px] font-semibold', isPositive ? 'profit-positive' : 'profit-negative')}>
          {isPositive ? '+' : ''}{profit.toFixed(2)} {t('common.chips')}
        </p>
        <p className="text-sm text-gray-400 mt-1">EV: {ev >= 0 ? '+' : ''}{ev.toFixed(2)}</p>
      </div>

      <div className="space-y-2">
        <InfoRow label={t('common.position')} value={hand.hero_position} />
        <InfoRow label="Stack" value={`${hand.hero_stack || 0} ${t('common.chips')}`} />
        <InfoRow label={t('common.villain')} value={villainPosition} />
        <InfoRow label={t('common.villain_cards')}>
          <div className="flex gap-[3px] items-center justify-end">
            {villainCards !== '—' ? parseCards(villainCards).map((c, i) => <CardTile key={i} card={c} size="lg" />) : <span>—</span>}
          </div>
        </InfoRow>
        <InfoRow label={t('hand_history.table.pot')} value={`${hand.total_pot || 0} ${t('common.chips')}`} />
        <InfoRow label="Multiplier" value={`${hand.multiplier || 1}x`} />
      </div>

      {(hand.flop || hand.turn || hand.river) && (
        <div className="p-4 bg-dark-300 rounded-lg">
          <p className="text-sm text-gray-400 mb-2">Board</p>
          <div className="flex gap-[3px] items-center">
            {parseCards(hand.flop).map((c, i) => <CardTile key={`flop-${i}`} card={c} size="lg" />)}
            {hand.turn && <CardTile card={hand.turn} size="lg" />}
            {hand.river && <CardTile card={hand.river} size="lg" />}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {hand.preflop_action && <ActionBlock title="Preflop" content={hand.preflop_action} />}
        {hand.flop_action && <ActionBlock title="Flop" content={hand.flop_action} />}
        {hand.turn_action && <ActionBlock title="Turn" content={hand.turn_action} />}
        {hand.river_action && <ActionBlock title="River" content={hand.river_action} />}
      </div>
    </div>
  )
}
