import React from 'react';
import { useTranslation } from 'react-i18next';
import { useReplayerStore, selectReplayerState } from '../../stores/replayerStore';
import { formatNumber } from '../../utils/formatters';
import PlayingCard from '../common/PlayingCard';
import ChipStack from '../common/ChipStack';
import { parseCards } from '../../utils/handNormalizer';

const SEAT_POSITIONS_9 = [
  { top: '85%', left: '50%' }, // Seat 1 (Hero) - Bottom Center
  { top: '80%', left: '25%' }, // Seat 2 - Bottom Left
  { top: '50%', left: '10%' }, // Seat 3 - Left
  { top: '20%', left: '25%' }, // Seat 4 - Top Left
  { top: '15%', left: '50%' }, // Seat 5 - Top Center
  { top: '20%', left: '75%' }, // Seat 6 - Top Right
  { top: '50%', left: '90%' }, // Seat 7 - Right
  { top: '80%', left: '75%' }, // Seat 8 - Bottom Right
];

const SEAT_POSITIONS_6 = [
  { top: '85%', left: '50%' }, // Seat 1 (Hero) - Bottom Center
  { top: '65%', left: '15%' }, // Seat 2 - Bottom Left
  { top: '25%', left: '15%' }, // Seat 3 - Top Left
  { top: '15%', left: '50%' }, // Seat 4 - Top Center
  { top: '25%', left: '85%' }, // Seat 5 - Top Right
  { top: '65%', left: '85%' }, // Seat 6 - Bottom Right
];

// Heads Up Positions
const SEAT_POSITIONS_2 = [
    { top: '15%', left: '50%' }, // 0 - Top
    { top: '85%', left: '50%' }, // 1 - Bottom
];

// 3-Max Positions
const SEAT_POSITIONS_3 = [
    { top: '25%', left: '20%' }, // 0 - Top Left
    { top: '85%', left: '50%' }, // 1 - Bottom
    { top: '25%', left: '80%' }, // 2 - Top Right
];

const ReplayerTable = () => {
  const { t } = useTranslation();
  const state = useReplayerStore(selectReplayerState);
  
  if (!state) return <div className="flex items-center justify-center h-full text-gray-500">{t('replayer.loading')}</div>;

  const { players, pot, communityCards, dealerSeat, showVillainHands, currentStreet, showInBB, bbSize } = state;
  
  let positions = SEAT_POSITIONS_9;
  if (players.length <= 2) positions = SEAT_POSITIONS_2;
  else if (players.length <= 3) positions = SEAT_POSITIONS_3;
  else if (players.length <= 6) positions = SEAT_POSITIONS_6;

  const formatAmount = (val) => {
    if (showInBB && bbSize > 0) {
      return (val / bbSize).toFixed(1) + ' BB';
    }
    return formatNumber(val);
  };

  const getActionStyle = (type) => {
    switch (type?.toLowerCase()) {
        case 'fold': return 'bg-gray-800 text-gray-400 border-gray-600';
        case 'check': return 'bg-emerald-800 text-emerald-200 border-emerald-600';
        case 'call': return 'bg-blue-800 text-blue-200 border-blue-600';
        case 'bet': return 'bg-orange-800 text-orange-200 border-orange-600';
        case 'raise': return 'bg-red-800 text-red-200 border-red-600';
        case 'all-in': return 'bg-purple-800 text-purple-200 border-purple-600';
        case 'win': return 'bg-yellow-600 text-black border-yellow-400 font-bold';
        default: return 'bg-gray-700 text-white border-gray-500';
    }
  };

  const heroIndex = players.findIndex(p => p.isHero);
  const btnIndex = players.findIndex(p => p.position === 'BTN');
  
  const getDisplayPosition = (playerIndex) => {
     if (heroIndex === -1) return positions[playerIndex];

     const N = players.length;
     let positionIndex = (playerIndex - heroIndex + N) % N;
     
      if (btnIndex !== -1) {
        const btnRotatedPos = (btnIndex - heroIndex + N) % N;
        const sbIndex = players.findIndex(p => p.position === 'SB');
        
        if (sbIndex !== -1) {
          const sbRotatedPos = (sbIndex - heroIndex + N) % N;
          const sbShouldBeRightOfBtn = (sbRotatedPos === (btnRotatedPos + 1) % N) || 
                                       (sbRotatedPos === (btnRotatedPos + 2) % N && N > 3);
          
          if (!sbShouldBeRightOfBtn) {
            positionIndex = (playerIndex - heroIndex + N - 1) % N;
          }
        }
      }
     
     return positions[positionIndex] || { top: '50%', left: '50%' };
  };

  // Calculate position for player's current bet (moved 40% towards center)
  const getBetPosition = (playerPos) => {
      const pTop = parseFloat(playerPos.top);
      const pLeft = parseFloat(playerPos.left);
      
      // Move towards center (50, 50)
      const factor = 0.4; 
      const bTop = pTop + (50 - pTop) * factor;
      const bLeft = pLeft + (50 - pLeft) * factor;

      return { top: `${bTop}%`, left: `${bLeft}%` };
  };

  // Calculate main pot (Total Pot - Current Bets)
  const currentBetsTotal = players.reduce((sum, p) => sum + p.currentBet, 0);
  const mainPot = Math.max(0, pot - currentBetsTotal);

  return (
    <div className="w-full h-full relative select-none overflow-hidden bg-emerald-900/20">
      {/* Table Felt */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[80%] h-[60%] bg-emerald-800 rounded-[200px] border-[10px] border-emerald-950 shadow-2xl">
        {/* Community Cards */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex gap-2 z-10">
          {communityCards.map((card, idx) => (
            <PlayingCard key={idx} card={card} size="lg" className="shadow-md animate-slide-up" />
          ))}
          {communityCards.length === 0 && (
            <div className="text-emerald-900/50 font-bold tracking-widest uppercase mt-2">
              SpinTracker
            </div>
          )}
        </div>

        {/* Main Pot Stack (Center) */}
        {mainPot > 0 && (
            <div className="absolute top-[65%] left-1/2 transform -translate-x-1/2 flex flex-col items-center z-10">
                <div className="mb-1 text-emerald-100 font-medium bg-black/30 px-3 py-1 rounded-full text-sm backdrop-blur-sm border border-emerald-500/20">
                    Pot: {formatAmount(pot)}
                </div>
            </div>
        )}
      </div>
      
      {/* Pot Info removed from felt, now integrated with chips */}

      {/* Players */}
      {players.map((player, idx) => {
        const pos = getDisplayPosition(idx);
        
        return (
          <div 
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 transition-all duration-300 ${player.isFolded ? 'opacity-50 grayscale' : ''} ${player.isWinner ? 'scale-110 z-20' : 'z-10'}`}
            style={{ top: pos.top, left: pos.left }}
            key={player.seat}
          >
            {/* Action Badge (Replaces jumping bubble) */}
            {player.actionLabel && (
              <div className={`absolute -top-10 left-1/2 transform -translate-x-1/2 z-50 px-3 py-1 rounded-md shadow-lg border text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-all duration-300 ${getActionStyle(player.lastActionType)}`}>
                {player.actionLabel.replace(/\d+(\.\d+)?/, (match) => {
                  const val = parseFloat(match);
                  if (!isNaN(val)) return formatAmount(val);
                  return match;
                })}
              </div>
            )}

            {/* Stack & Cards */}
            <div className="bg-gray-900/90 rounded p-1.5 min-w-[80px] text-center border border-gray-700 shadow-xl backdrop-blur-sm">
              <div className="text-yellow-400 font-mono text-xs font-bold mb-1">
                {formatAmount(player.currentStack)}
              </div>
              
              {/* Cards */}
              <div className="flex justify-center gap-1 h-8">
                {player.cards && (player.isHero || showVillainHands || (player.isWinner && currentStreet === 4)) ? (
                   parseCards(player.cards).map((c, i) => (
                     <PlayingCard key={i} card={c} size="sm" />
                   ))
                ) : (
                  !player.isFolded && (
                    <>
                      <div className="bg-blue-800 rounded w-6 h-8 border border-white/20 shadow-sm"></div>
                      <div className="bg-blue-800 rounded w-6 h-8 border border-white/20 shadow-sm"></div>
                    </>
                  )
                )}
              </div>
            </div>

            {/* Avatar Circle (Moved below cards) */}
            <div className={`relative flex items-center justify-center`}>
              <span className={`text-xs font-bold text-white overflow-hidden text-ellipsis px-3 py-1 rounded w-full text-center whitespace-nowrap bg-black/70 border border-white/20 shadow-md ${player.isWinner ? 'text-yellow-400 border-yellow-400/50' : ''}`}>
                {player.name}
              </span>
              {/* Dealer Button */}
              {player.seat === dealerSeat && (
                <div className="absolute -bottom-3 -right-2 w-5 h-5 bg-white text-black rounded-full text-[10px] flex items-center justify-center font-bold border border-gray-300 shadow z-20">
                  D
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Current Bet Stacks (Rendered after players to ensure actions are on top) */}
      {players.map((player, idx) => {
        if (player.currentBet <= 0) return null;
        
        const pos = getDisplayPosition(idx);
        const betPos = getBetPosition(pos);
        
        return (
          <div 
            key={`bet-${player.seat}`}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 z-5 flex flex-col items-center pointer-events-none"
            style={{ top: betPos.top, left: betPos.left }}
          >
            <ChipStack amount={player.currentBet} size="sm" />
            <div className="mt-1 bg-black/80 text-white text-xs font-bold px-2 py-0.5 rounded-full font-mono border border-white/20 shadow-md whitespace-nowrap z-20">
              {formatAmount(player.currentBet)}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ReplayerTable;
