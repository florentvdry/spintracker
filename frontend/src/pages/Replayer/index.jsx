import React, { useEffect } from 'react';
import { useReplayerStore } from '../../stores/replayerStore';
import ReplayerTable from '../../components/replayer/ReplayerTable';
import ReplayerControls from '../../components/replayer/ReplayerControls';
import ReplayerTimeline from '../../components/replayer/ReplayerTimeline';
import ExportModal from '../../components/ui/ExportModal';
import { useTranslation } from 'react-i18next';

const Replayer = () => {
  const { setReplayerHand, closeReplayer, isPlaying, nextStep, playbackSpeed, hand } = useReplayerStore();
  const [error, setError] = React.useState(null);
  const { t } = useTranslation();

  useEffect(() => {
    const loadData = async () => {
      try {
        const { ipcRenderer } = window.require('electron');
        console.log('[Replayer] Requesting hand data via replayer-get-data');
        const payload = await ipcRenderer.invoke('replayer-get-data');
        
        console.log('[Replayer] Received payload:', payload);
        
        let handData = payload;
        
        // Handle array format (when wrapped in array by IPC)
        if (Array.isArray(payload) && payload.length > 0) {
          handData = payload[0];
        }
        
        if (handData && handData.handData) {
          setReplayerHand(handData.handData, {
            handQueue: handData.handQueue,
            currentHandIndex: handData.currentHandIndex
          });
        } else if (handData) {
          setReplayerHand(handData);
        } else {
          setError(t('replayer.no_data'));
        }
      } catch (e) {
        console.error('[Replayer] Error loading data:', e);
        setError(t('replayer.load_error') + e.message);
      }
    };

    loadData();
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

  if (error) {
    return (
      <div className="h-screen w-screen bg-gray-900 text-red-400 flex flex-col items-center justify-center p-8 text-center">
        <h1 className="text-2xl font-bold mb-4">{t('replayer.error_title')}</h1>
        <p className="mb-6 bg-gray-800 p-4 rounded border border-red-900/50 max-w-lg">{error}</p>
        <button onClick={closeReplayer} className="px-6 py-2 bg-gray-800 hover:bg-gray-700 rounded text-white transition-colors">
          {t('replayer.close')}
        </button>
      </div>
    );
  }

  return (
    <>
      <ExportModal />
      <div className="h-screen w-screen bg-gray-900 text-gray-100 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-10 bg-gray-800 flex items-center justify-between px-4 border-b border-gray-700">
        <span className="font-semibold text-sm">{t('replayer.hand_title')} {hand?.id ? `- ${hand.id}` : ''}</span>
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
    </>
  );
};

export default Replayer;
