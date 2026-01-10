import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useReplayerStore, STREETS, selectReplayerState } from '../../stores/replayerStore';
import { formatNumber } from '../../utils/formatters';

const STREET_LABELS = {
  [STREETS.PREFLOP]: 'Preflop',
  [STREETS.FLOP]: 'Flop',
  [STREETS.TURN]: 'Turn',
  [STREETS.RIVER]: 'River',
  [STREETS.SHOWDOWN]: 'Showdown'
};

const ReplayerTimeline = () => {
  const { t } = useTranslation();
  const { hand, currentActionIndex, jumpToStep } = useReplayerStore();
  const state = useReplayerStore(selectReplayerState);
  const activeItemRef = useRef(null);

  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentActionIndex]);

  if (!hand || !state) return null;

  const { showInBB, bbSize } = state;

  const formatAmount = (val) => {
    if (showInBB && bbSize > 0) {
      return (val / bbSize).toFixed(1) + ' BB';
    }
    return formatNumber(val);
  };

  let currentStreet = -1;

  return (
    <div className="flex flex-col text-sm">
      <div className="p-3 bg-gray-800 font-bold border-b border-gray-700 sticky top-0 z-10">
        Action Log
      </div>
      
      <div className="flex flex-col">
        {/* Initial State / Blinds */}
        <div 
          className={`px-3 py-2 border-b border-gray-800 cursor-pointer hover:bg-gray-800 transition-colors ${currentActionIndex === -1 ? 'bg-blue-900/30 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'}`}
          onClick={() => jumpToStep(-1)}
          ref={currentActionIndex === -1 ? activeItemRef : null}
        >
          <div className="font-mono text-gray-500 text-xs">{t('replayer.start')}</div>
          <div className="text-gray-300">{t('replayer.new_hand')}</div>
        </div>

        {hand.actions.map((action, index) => {
          const isNewStreet = action.street !== currentStreet;
          if (isNewStreet) currentStreet = action.street;

          const isActive = index === currentActionIndex;

          return (
            <React.Fragment key={index}>
              {isNewStreet && (
                <div className="bg-gray-800/50 px-3 py-1 text-xs font-bold text-gray-500 uppercase tracking-wider sticky top-0 backdrop-blur-sm">
                  {STREET_LABELS[action.street] || 'Unknown'}
                </div>
              )}
              
              <div 
                ref={isActive ? activeItemRef : null}
                onClick={() => jumpToStep(index)}
                className={`px-3 py-2 border-b border-gray-800 cursor-pointer hover:bg-gray-800 transition-colors flex justify-between items-center group ${isActive ? 'bg-blue-900/30 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'}`}
              >
                <div className="flex flex-col">
                  <span className={`font-semibold ${action.player === hand.heroName ? 'text-yellow-400' : 'text-gray-300'}`}>
                    {action.player}
                  </span>
                  <span className="text-gray-400 text-xs capitalize">
                    {action.type}
                  </span>
                </div>
                
                {action.amount > 0 && (
                  <div className="font-mono text-emerald-400 font-bold">
                    {formatAmount(action.amount)}
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default ReplayerTimeline;
