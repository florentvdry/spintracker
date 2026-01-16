import React, { useEffect } from 'react';
import { useReplayerStore } from '../../stores/replayerStore';
import ReplayerTable from '../../components/replayer/ReplayerTable';
import ReplayerControls from '../../components/replayer/ReplayerControls';
import ReplayerTimeline from '../../components/replayer/ReplayerTimeline';

const Replayer = () => {
  const { setReplayerHand, closeReplayer, isPlaying, nextStep, playbackSpeed } = useReplayerStore();

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data.type === 'loadReplayer') {
        setReplayerHand(event.data.data);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [setReplayerHand]);

  // Auto-play Loop
  useEffect(() => {
    let interval;
    if (isPlaying) {
      interval = setInterval(() => {
        nextStep();
      }, 1000 / playbackSpeed);
    }
    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, nextStep]);

  // Handle Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') useReplayerStore.getState().nextStep();
      if (e.key === 'ArrowLeft') useReplayerStore.getState().prevStep();
      if (e.key === 'PageDown') useReplayerStore.getState().nextHand();
      if (e.key === 'PageUp') useReplayerStore.getState().prevHand();
      if (e.key === ' ') {
        e.preventDefault();
        useReplayerStore.getState().togglePlay();
      }
      if (e.key === 'Escape') closeReplayer();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeReplayer]);

  return (
    <div className="h-screen w-screen bg-gray-900 text-gray-100 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-10 bg-gray-800 flex items-center justify-between px-4 border-b border-gray-700">
        <span className="font-semibold text-sm">Hand Replayer</span>
        <button onClick={closeReplayer} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white">
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Table Area */}
        <div className="flex-1 relative bg-gray-950 flex flex-col">
          <div className="flex-1 relative">
            <ReplayerTable />
          </div>
          <div className="h-16 bg-gray-900 border-t border-gray-800">
            <ReplayerControls />
          </div>
        </div>

        {/* Sidebar Timeline */}
        <div className="w-64 bg-gray-900 border-l border-gray-800 overflow-y-auto">
          <ReplayerTimeline />
        </div>
      </div>
    </div>
  );
};

export default Replayer;