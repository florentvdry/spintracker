import React from 'react';
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
    { top: '85%', left: '50%' }, // Hero - Bottom
    { top: '15%', left: '50%' }, // Villain - Top
];

// 3-Max Positions
const SEAT_POSITIONS_3 = [
    { top: '85%', left: '50%' }, // Hero - Bottom
    { top: '25%', left: '20%' }, // Left
    { top: '25%', left: '80%' }, // Right
];

const ReplayerTable = () => {
  const state = useReplayerStore(selectReplayerState);
  
  if (!state) return <div className="flex items-center justify-center h-full text-gray-500">Loading Hand...</div>;

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

  // Helper to normalize seat index for display so Hero is always bottom center?
  // For now, we just map seat number to position index roughly.
  // Ideally we rotate so hero is at index 0.
  const heroIndex = players.findIndex(p => p.isHero);
  
  // Calculate rotation to put Hero at index 0 (bottom seat)
  // If heroIndex is 2 (seat 3) in a 6-player table, we want seat 3 to map to position 0.
  // Formula: (seatIndex - heroIndex + N) % N
  
  const getDisplayPosition = (playerIndex) => {
     if (heroIndex === -1) return positions[playerIndex]; // Fallback if no hero

     const N = players.length;
     // Rotate so hero is always at position 0 (Bottom)
     // We are iterating players array by index 0..N-1.
     // Player at heroIndex should get position 0.
     // Player at heroIndex+1 should get position 1.
     const positionIndex = (playerIndex - heroIndex + N) % N;
     
     // Special case handling for small tables to ensure nice distribution if needed
     // But SEAT_POSITIONS arrays are already defined relative to "Hero at bottom".
     
     return positions[positionIndex] || { top: '50%', left: '50%' };
  };

  // Calculate position for player's current bet (moved 30% towards center)
  const getBetPosition = (playerPos) => {
      const pTop = parseFloat(playerPos.top);
      const pLeft = parseFloat(playerPos.left);
      
      // Move towards center (50, 50)
      const factor = 0.3; 
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
        const betPos = getBetPosition(pos);
        
        return (
          <React.Fragment key={player.seat}>
          <div 
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 transition-all duration-300 ${player.isFolded ? 'opacity-50 grayscale' : ''} ${player.isWinner ? 'scale-110 z-20' : 'z-10'}`}
            style={{ top: pos.top, left: pos.left }}
          >
            {/* Winner Badge (Removed redundant bounce animation, now part of action badge logic or handled separately) */}
            {/* If we want a separate winner badge, we can keep it, but user said "double winner bubble".
                The action label also shows "Win X". So we should probably remove this one or ensure they don't overlap.
                The user specifically asked to "remove the jumping one". The previous action label was jumping.
                This badge was also bouncing. Let's remove this explicit "WINNER" badge and rely on the Action Badge "Win 100".
            */}

            {/* Action Badge (Replaces jumping bubble) */}
            {player.actionLabel && (
              <div className={`absolute -top-10 left-1/2 transform -translate-x-1/2 z-30 px-3 py-1 rounded-md shadow-lg border text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-all duration-300 ${getActionStyle(player.lastActionType)}`}>
                {player.actionLabel.replace(/\d+(\.\d+)?/, (match) => {
                  const val = parseFloat(match);
                  if (!isNaN(val)) return formatAmount(val);
                  return match;
                })}
              </div>
            )}

            {/* Avatar Circle (Removed Circle) */}
            <div className={`relative flex items-center justify-center`}>
              <span className={`text-xs font-bold text-white overflow-hidden text-ellipsis px-2 py-1 rounded w-full text-center whitespace-nowrap bg-black/50 border border-white/10 ${player.isWinner ? 'text-yellow-400 border-yellow-400/50' : ''}`}>
                {player.name}
              </span>
              {/* Dealer Button */}
              {player.seat === dealerSeat && (
                <div className="absolute -bottom-3 -right-2 w-5 h-5 bg-white text-black rounded-full text-[10px] flex items-center justify-center font-bold border border-gray-300 shadow z-20">
                  D
                </div>
              )}
            </div>

            {/* Stack & Cards */}
            <div className="bg-gray-900/90 rounded p-1.5 min-w-[80px] text-center border border-gray-700 shadow-xl backdrop-blur-sm">
              <div className="text-yellow-400 font-mono text-xs font-bold mb-1">
                {formatAmount(player.currentStack)}
              </div>
              
              {/* Cards */}
              <div className="flex justify-center gap-1 h-8">
                {player.cards && (player.isHero || showVillainHands || currentStreet === 4) ? (
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
          </div>

          {/* Current Bet Stack (Rendered separate from player container for proper positioning) */}
          {player.currentBet > 0 && (
              <div 
                  className="absolute transform -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center pointer-events-none"
                  style={{ top: betPos.top, left: betPos.left }}
              >
                  <ChipStack amount={player.currentBet} size="sm" />
                  <div className="mt-1 bg-black/80 text-white text-xs font-bold px-2 py-0.5 rounded-full font-mono border border-white/20 shadow-md whitespace-nowrap z-30">
                      {formatAmount(player.currentBet)}
                  </div>
              </div>
          )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default ReplayerTable;
