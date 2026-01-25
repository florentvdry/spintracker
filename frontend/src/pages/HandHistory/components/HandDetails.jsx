import { X } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import PlayingCard from '../../../components/common/PlayingCard';
import { parseCards } from '../../../utils/handNormalizer';

export default function HandDetails({ hand, onClose }) {
  const { t } = useTranslation();
  if (!hand) return null;

  const profit = hand.hero_profit || 0;
  const isPositive = profit >= 0;

  // Derive villain info from players list
  const villain = hand.players?.find(p => !p.IsHero);
  const villainPosition = hand.villain_position || villain?.Position || '—';
  const villainCards = hand.villain_cards || villain?.Cards || '—';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {parseCards(hand.hero_cards).map((c, i) => (
              <PlayingCard key={i} card={c} size="sm" />
            ))}
          </div>
          <div>
            <p className="text-xs text-gray-400">{hand.date_time}</p>
          </div>
        </div>
        <button onClick={onClose} className="btn-icon">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Result */}
      <div className="p-4 bg-dark-200 rounded-lg text-center">
        <p className="text-sm text-gray-400 mb-1">{t('common.result')}</p>
        <p className={clsx(
          'text-2xl font-bold',
          isPositive ? 'profit-positive' : 'profit-negative'
        )}>
          {isPositive ? '+' : ''}{profit.toFixed(2)} {t('common.chips')}
        </p>
        {hand.ev_chips !== null && (
          <p className="text-sm text-gray-400 mt-1">
            EV: {hand.ev_chips >= 0 ? '+' : ''}{hand.ev_chips?.toFixed(2)}
          </p>
        )}
      </div>

      {/* Info */}
      <div className="space-y-2">
        <InfoRow label={t('common.position')} value={hand.hero_position} />
        <InfoRow label="Stack" value={`${hand.hero_stack || 0} ${t('common.chips')}`} />
        <InfoRow label={t('common.villain', 'Villain')} value={villainPosition} />
        <InfoRow label={t('common.villain_cards', 'Villain Cards')} value={
          <div className="flex gap-0.5 justify-end">
            {villainCards !== '—' ? parseCards(villainCards).map((c, i) => (
              <PlayingCard key={i} card={c} size="xs" />
            )) : '—'}
          </div>
        } />
        <InfoRow label={t('hand_history.table.pot')} value={`${hand.total_pot || 0} ${t('common.chips')}`} />
        <InfoRow label="Multiplier" value={`${hand.multiplier || 1}x`} />
      </div>

      {/* Board */}
      {(hand.flop || hand.turn || hand.river) && (
        <div className="p-4 bg-dark-200 rounded-lg">
          <p className="text-sm text-gray-400 mb-2">Board</p>
          <div className="flex gap-1">
            {hand.flop && parseCards(hand.flop).map((c, i) => (
              <PlayingCard key={`flop-${i}`} card={c} size="sm" />
            ))}
            {hand.turn && parseCards(hand.turn).map((c, i) => (
              <PlayingCard key={`turn-${i}`} card={c} size="sm" />
            ))}
            {hand.river && parseCards(hand.river).map((c, i) => (
              <PlayingCard key={`river-${i}`} card={c} size="sm" />
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2">
        {hand.preflop_action && (
          <ActionBlock title="Preflop" content={hand.preflop_action} />
        )}
        {hand.flop_action && (
          <ActionBlock title="Flop" content={hand.flop_action} />
        )}
        {hand.turn_action && (
          <ActionBlock title="Turn" content={hand.turn_action} />
        )}
        {hand.river_action && (
          <ActionBlock title="River" content={hand.river_action} />
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-dark-100/30">
      <span className="text-gray-400">{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}

function ActionBlock({ title, content }) {
  return (
    <div className="p-3 bg-dark-200 rounded-lg">
      <p className="text-xs text-gray-500 mb-1">{title}</p>
      <p className="text-sm text-gray-300 whitespace-pre-line">{content}</p>
    </div>
  );
}

