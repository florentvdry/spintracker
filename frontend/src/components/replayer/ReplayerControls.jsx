import React from 'react';
import { useReplayerStore, STREETS } from '../../stores/replayerStore';
import { Play, Pause, SkipBack, SkipForward, FastForward, Rewind, Eye, EyeOff } from 'lucide-react';

const ReplayerControls = () => {
  const { 
    isPlaying, 
    togglePlay, 
    nextStep, 
    prevStep, 
    prevHand,
    nextHand,
    handQueue,
    currentHandIndex,
    jumpToStreet,
    playbackSpeed,
    setPlaybackSpeed,
    showVillainHands,
    toggleShowVillainHands,
    showInBB,
    toggleShowInBB
  } = useReplayerStore();

  const speeds = [0.5, 1, 2, 4];
  const hasMultipleHands = handQueue && handQueue.length > 1;
  const hasPrevHand = hasMultipleHands && currentHandIndex > 0;
  const hasNextHand = hasMultipleHands && currentHandIndex < handQueue.length - 1;

  return (
    <div className="h-full flex items-center justify-between px-4 text-gray-300">
      {/* Street Navigation */}
      <div className="flex gap-1">
        <button onClick={() => jumpToStreet(STREETS.PREFLOP)} className="px-2 py-1 hover:bg-gray-800 rounded text-xs font-bold">PF</button>
        <button onClick={() => jumpToStreet(STREETS.FLOP)} className="px-2 py-1 hover:bg-gray-800 rounded text-xs font-bold">F</button>
        <button onClick={() => jumpToStreet(STREETS.TURN)} className="px-2 py-1 hover:bg-gray-800 rounded text-xs font-bold">T</button>
        <button onClick={() => jumpToStreet(STREETS.RIVER)} className="px-2 py-1 hover:bg-gray-800 rounded text-xs font-bold">R</button>
      </div>

      {/* Main Controls */}
      <div className="flex items-center gap-4">
        {/* Prev Hand */}
        <button 
          onClick={prevHand} 
          disabled={!hasPrevHand}
          className={`p-2 rounded-full transition-colors ${!hasPrevHand ? 'text-gray-700 cursor-not-allowed' : 'hover:bg-gray-800 hover:text-white'}`}
          title="Previous Hand"
        >
          <Rewind size={20} />
        </button>

        <button onClick={prevStep} className="p-2 hover:bg-gray-800 rounded-full hover:text-white transition-colors" title="Previous Action">
          <SkipBack size={20} />
        </button>
        
        <button 
          onClick={togglePlay} 
          className="p-3 bg-blue-600 hover:bg-blue-500 rounded-full text-white shadow-lg transition-all hover:scale-105"
        >
          {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
        </button>

        <button onClick={nextStep} className="p-2 hover:bg-gray-800 rounded-full hover:text-white transition-colors" title="Next Action">
          <SkipForward size={20} />
        </button>

        {/* Next Hand */}
        <button 
          onClick={nextHand} 
          disabled={!hasNextHand}
          className={`p-2 rounded-full transition-colors ${!hasNextHand ? 'text-gray-700 cursor-not-allowed' : 'hover:bg-gray-800 hover:text-white'}`}
          title="Next Hand"
        >
          <FastForward size={20} />
        </button>
      </div>

      {/* Right Side: Speed & Hide Hands */}
      <div className="flex items-center gap-4">
        <button 
          onClick={toggleShowInBB}
          className={`px-2 py-1 rounded text-xs font-bold hover:bg-gray-800 transition-colors ${showInBB ? 'text-blue-400 bg-blue-900/30' : 'text-gray-400'}`}
          title="Toggle Big Blinds"
        >
          BB
        </button>

        <button 
          onClick={toggleShowVillainHands}
          className={`p-1.5 rounded hover:bg-gray-800 transition-colors ${!showVillainHands ? 'text-red-400' : 'text-gray-400'}`}
          title={showVillainHands ? "Hide Villain Hands" : "Show Villain Hands"}
        >
          {showVillainHands ? <Eye size={18} /> : <EyeOff size={18} />}
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-mono">SPEED</span>
          <div className="flex bg-gray-800 rounded p-0.5">
            {speeds.map(speed => (
              <button
                key={speed}
                onClick={() => setPlaybackSpeed(speed)}
                className={`px-2 py-0.5 text-xs rounded ${playbackSpeed === speed ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-300'}`}
              >
                x{speed}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReplayerControls;