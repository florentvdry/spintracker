import { create } from 'zustand';
import { normalizeHand } from '../utils/handNormalizer';
import { ipcService } from '@services/ipcService';

export const STREETS = {
  PREFLOP: 0,
  FLOP: 1,
  TURN: 2,
  RIVER: 3,
  SHOWDOWN: 4
};

export const useReplayerStore = create((set, get) => ({
  isOpen: false,
  isMinimized: false,
  hand: null,
  currentActionIndex: -1,
  isPlaying: false,
  playbackSpeed: 1, // 1x
  showVillainHands: JSON.parse(localStorage.getItem('replayer_showVillainHands')) ?? true,
  showInBB: JSON.parse(localStorage.getItem('replayer_showInBB')) ?? false,
  
  // Hand Queue State
  handQueue: [],
  currentHandIndex: -1,
  isLoadingHand: false,
  heroName: null,

  // Recording State - keep recorder in a module-level variable to avoid IPC cloning issues
  isRecording: false,
  showExportModal: false,
  recordingType: null, // 'hand' or 'tournament'

  // Actions
  toggleShowVillainHands: () => {
    set((state) => {
      const newValue = !state.showVillainHands;
      localStorage.setItem('replayer_showVillainHands', JSON.stringify(newValue));
      return { showVillainHands: newValue };
    });
  },

  toggleShowInBB: () => {
    set((state) => {
      const newValue = !state.showInBB;
      localStorage.setItem('replayer_showInBB', JSON.stringify(newValue));
      return { showInBB: newValue };
    });
  },

  openExportModal: () => {
    const { hand } = get();
    if (!hand) return;
    set({ showExportModal: true });
  },

  closeExportModal: () => {
    set({ showExportModal: false });
  },

  confirmExport: async (exportType) => {
    const { handQueue } = get();
    console.log('[VideoExport] confirmExport called, type:', exportType);
    set({ showExportModal: false, isRecording: true, recordingType: exportType });
    
    try {
      console.log('[VideoExport] Calling startVideoRecording...');
      await startVideoRecording(exportType);
      console.log('[VideoExport] startVideoRecording completed successfully');
    } catch (error) {
      // Extract error message safely - error objects may not be clonable
      let errorMessage = 'Unknown error';
      try {
        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (typeof error === 'string') {
          errorMessage = error;
        } else if (error && typeof error === 'object') {
          errorMessage = error.message || JSON.stringify(error);
        }
      } catch (e) {
        errorMessage = 'Failed to extract error message';
      }
      console.error('[VideoExport] Video export failed:', errorMessage);
      alert('Erreur lors de l\'export vidéo: ' + errorMessage);
    } finally {
      console.log('[VideoExport] Cleaning up recording state');
      set({ isRecording: false, recordingType: null });
    }
  },

  exportVideo: async () => {
    const { handQueue, hand } = get();
    console.log('[VideoExport] exportVideo called, handQueue length:', handQueue?.length);
    if (!hand) {
      console.warn('[VideoExport] No hand loaded');
      return;
    }

    if (handQueue.length > 1) {
      set({ showExportModal: true });
    } else {
      set({ isRecording: true, recordingType: 'hand' });
      try {
        console.log('[VideoExport] Starting single hand recording...');
        await startVideoRecording('hand');
      } catch (error) {
        let errorMessage = 'Unknown error';
        try {
          if (error instanceof Error) {
            errorMessage = error.message;
          } else if (typeof error === 'string') {
            errorMessage = error;
          } else if (error && typeof error === 'object') {
            errorMessage = error.message || JSON.stringify(error);
          }
        } catch (e) {
          errorMessage = 'Failed to extract error message';
        }
        console.error('[VideoExport] Video export failed:', errorMessage);
        alert('Erreur lors de l\'export vidéo: ' + errorMessage);
      } finally {
        set({ isRecording: false, recordingType: null });
      }
    }
  },

  loadHandQueue: async (handIds, heroName = null) => {
    if (!handIds || handIds.length === 0) return;
    
    set({ 
      handQueue: handIds, 
      currentHandIndex: 0,
      heroName,
      isOpen: true,
      isMinimized: false 
    });

    await get().loadHand(handIds[0]);
  },

  loadHand: async (handId) => {
    set({ isLoadingHand: true });
    try {
      const { heroName } = get();
      const res = await ipcService.getHandDetails(handId, heroName);
      if (res.success) {
        // Check if we are already in a replayer window
        const isReplayerWindow = typeof window !== 'undefined' && 
                                (window.location.href.includes('replayer.html') || 
                                 window.location.hash.includes('replayer'));
        
        if (isReplayerWindow) {
          get().setReplayerHand(res.data);
        } else {
          get().openReplayer(res.data);
        }
      }
    } catch (e) {
      console.error("Failed to load hand", e);
    } finally {
      set({ isLoadingHand: false });
    }
  },

  nextHand: () => {
    const { handQueue, currentHandIndex } = get();
    if (currentHandIndex < handQueue.length - 1) {
      const newIndex = currentHandIndex + 1;
      set({ currentHandIndex: newIndex });
      get().loadHand(handQueue[newIndex]);
    }
  },

  prevHand: () => {
    const { handQueue, currentHandIndex } = get();
    if (currentHandIndex > 0) {
      const newIndex = currentHandIndex - 1;
      set({ currentHandIndex: newIndex });
      get().loadHand(handQueue[newIndex]);
    }
  },

  openReplayer: (handData) => {
    const { handQueue, currentHandIndex } = get();
    // Sérialiser les données pour éviter les erreurs de clonage IPC
    // On ne garde que les données essentielles pour le replayer
    const serializedHandData = JSON.parse(JSON.stringify(handData));
    const serializedHandQueue = handQueue.map(hand => JSON.parse(JSON.stringify(hand)));
    
    // Open replayer in a new window via IPC, passing queue info for navigation
    ipcService.invoke('open-replayer', {
      handData: serializedHandData,
      handQueue: serializedHandQueue,
      currentHandIndex
    });
  },

  setReplayerHand: (handData, queueInfo = null) => {
    const normalized = normalizeHand(handData);
    
    // Inject virtual street actions if board exists but actions are missing
    // This allows stepping through Flop/Turn/River even if no player actions occurred
    if (normalized && normalized.board && normalized.board.length > 0 && normalized.actions) {
      const resultTypes = ['win', 'showdown', 'summary'];
      const gameActions = normalized.actions.filter(a => !resultTypes.includes(a.type));
      const resultActions = normalized.actions.filter(a => resultTypes.includes(a.type));
      
      const hasFlop = gameActions.some(a => a.street === STREETS.FLOP);
      const hasTurn = gameActions.some(a => a.street === STREETS.TURN);
      const hasRiver = gameActions.some(a => a.street === STREETS.RIVER);
      
      const newActions = [...gameActions];
      
      // Add Deal Flop if we have 3+ cards and no flop actions
      if (normalized.board.length >= 3 && !hasFlop) {
        newActions.push({ 
          type: 'deal', 
          street: STREETS.FLOP, 
          action: 'Deal Flop',
          player: 'Dealer',
          seat: -1 
        });
      }
      
      // Add Deal Turn if we have 4+ cards and no turn actions
      if (normalized.board.length >= 4 && !hasTurn) {
        newActions.push({ 
          type: 'deal', 
          street: STREETS.TURN, 
          action: 'Deal Turn',
          player: 'Dealer',
          seat: -1 
        });
      }
      
      // Add Deal River if we have 5 cards and no river actions
      if (normalized.board.length >= 5 && !hasRiver) {
        newActions.push({ 
          type: 'deal', 
          street: STREETS.RIVER, 
          action: 'Deal River',
          player: 'Dealer',
          seat: -1 
        });
      }
      
      // Re-append result actions
      newActions.push(...resultActions);
      normalized.actions = newActions;
    }

    set((state) => ({
      isOpen: true,
      isMinimized: false,
      hand: normalized,
      currentActionIndex: -1,
      isPlaying: false,
      handQueue: queueInfo ? queueInfo.handQueue : (state.isLoadingHand ? state.handQueue : []),
      currentHandIndex: queueInfo ? queueInfo.currentHandIndex : (state.isLoadingHand ? state.currentHandIndex : -1)
    }));
  },

  closeReplayer: () => {
    if (window.opener) {
      window.close();
    } else {
      set({ isOpen: false, isPlaying: false });
    }
  },

  minimizeReplayer: (isMinimized) => {
    set({ isMinimized });
  },

  setPlaybackSpeed: (speed) => {
    set({ playbackSpeed: speed });
  },

  togglePlay: () => {
    const { isPlaying, currentActionIndex, hand } = get();
    if (!hand) return;
    
    // If at end, restart
    if (currentActionIndex >= hand.actions.length - 1) {
      set({ currentActionIndex: -1, isPlaying: true });
    } else {
      set({ isPlaying: !isPlaying });
    }
  },

  nextStep: () => {
    const { currentActionIndex, hand, isRecording, recordingType, handQueue, currentHandIndex } = get();
    if (hand && currentActionIndex < hand.actions.length - 1) {
      set({ currentActionIndex: currentActionIndex + 1 });
    } else {
      // If recording tournament and not last hand, advance to next hand
      if (isRecording && recordingType === 'tournament' && currentHandIndex < handQueue.length - 1) {
        get().nextHand();
      } else {
        set({ isPlaying: false });
      }
    }
  },

  prevStep: () => {
    const { currentActionIndex } = get();
    if (currentActionIndex > -1) {
      set({ currentActionIndex: currentActionIndex - 1 });
    }
  },

  jumpToStep: (index) => {
    const { hand } = get();
    if (hand && index >= -1 && index < hand.actions.length) {
      set({ currentActionIndex: index });
    }
  },

  jumpToStreet: (street) => {
    const { hand } = get();
    if (!hand) return;
    
    // Find first action of that street
    const index = hand.actions.findIndex(a => a.street === street);
    if (index !== -1) {
      set({ currentActionIndex: index });
    } else if (street === STREETS.PREFLOP) {
      set({ currentActionIndex: -1 });
    } else {
      // No actions for this street, jump to the last action before this street
      // or to the end of the hand if we're going to showdown
      const lastActionIndex = hand.actions.findLastIndex(a => a.street < street);
      if (lastActionIndex !== -1) {
        set({ currentActionIndex: lastActionIndex });
      } else if (street >= STREETS.SHOWDOWN && hand.actions.length > 0) {
        // If going to showdown and no street actions, go to last action (win)
        set({ currentActionIndex: hand.actions.length - 1 });
      }
    }
  }
}));

// Selector to compute the visible state of the table
export const selectReplayerState = (state) => {
  const { hand, currentActionIndex, showVillainHands, showInBB } = state;
  if (!hand) return null;

  // Initial state
  let pot = 0;
  let communityCards = [];
  let currentStreet = STREETS.PREFLOP;
  
  // Initialize community cards based on current street
  // This ensures board cards are shown even without street actions
  // but still respects the flop/turn/river progression
  if (currentActionIndex >= -1) {
    if (currentActionIndex === -1) {
      // Start of hand - no cards
      communityCards = [];
    } else {
      // Check if we have actions to determine the current street
      let maxStreet = STREETS.PREFLOP;
      let hasStreetActions = false;
      
      // Find the highest street with actions
      for (let i = 0; i <= currentActionIndex; i++) {
        const action = hand.actions[i];
        if (action && action.street > maxStreet) {
          maxStreet = action.street;
          hasStreetActions = true;
        }
      }
      
      // Also check if we have board cards for streets without actions
      // This handles the case where there are no flop/turn/river actions
      if (hand.board && hand.board.length > 0) {
        // If we have a board, determine what should be shown based on progression
        // Check if there are any actions after preflop (even if not on specific streets)
        const hasPostflopActions = hand.actions.some((action, i) => 
          i <= currentActionIndex && action.street > STREETS.PREFLOP
        );
        
        if (hasPostflopActions || currentActionIndex >= hand.actions.length - 1) {
          // We're in postflop or at showdown - show appropriate cards
          // Only show cards based on the street reached, not board length
          if (maxStreet >= STREETS.RIVER) {
            communityCards = hand.board.slice(0, 5); // River - 5 cards
          } else if (maxStreet >= STREETS.TURN) {
            communityCards = hand.board.slice(0, 4); // Turn - 4 cards
          } else if (maxStreet >= STREETS.FLOP) {
            communityCards = hand.board.slice(0, 3); // Flop - 3 cards
          }
        }
      }
    }
  }
  
  // Deep copy players to avoid mutating store
  const players = hand.players.map(p => ({
    ...p,
    currentStack: p.stack,
    currentBet: p.initialBet || 0, // Initialize with posted blinds
    isActive: true,
    isFolded: false,
    actionLabel: null, // "Check", "Bet 10", etc.
    lastActionType: null
  }));

  // Process actions up to current index
  for (let i = 0; i <= currentActionIndex; i++) {
    const action = hand.actions[i];
    if (!action) continue;

    // Special case: if we're at the last action (showdown) and there are no postflop actions,
    // we should show the appropriate board cards progressively
    if (i === currentActionIndex && action.type === 'win' && currentStreet === STREETS.PREFLOP) {
      // We're at showdown without any postflop actions
      // Show cards progressively based on standard poker progression
      if (hand.board && hand.board.length > 0) {
        // Always show flop (3 cards) at minimum when reaching showdown
        if (hand.board.length >= 3) {
          communityCards = hand.board.slice(0, 3); // Flop only
        }
      }
    }

    const player = players.find(p => p.seat === action.seat);
    
    // Handle street changes (reset current bets, deal cards)
    if (action.street !== currentStreet) {
      // Collect bets into pot
      players.forEach(p => {
        pot += p.currentBet;
        p.currentBet = 0;
        p.actionLabel = null;
      });
      currentStreet = action.street;
      
      // Update board when street changes
      if (currentStreet === STREETS.FLOP) communityCards = hand.board.slice(0, 3);
      else if (currentStreet === STREETS.TURN) communityCards = hand.board.slice(0, 4);
      else if (currentStreet === STREETS.RIVER) communityCards = hand.board.slice(0, 5);
    }

    if (player) {
      player.lastActionType = action.type;
      
      switch (action.type) {
        case 'post': // Blinds/Antes
        case 'bet':
        case 'raise':
        case 'call':
        case 'all-in':
          const amount = action.amount || 0;
          
          player.currentStack -= amount;
          player.currentBet += amount;
          player.actionLabel = `${action.type} ${amount}`;
          break;
          
        case 'check':
          player.actionLabel = 'Check';
          break;
          
        case 'fold':
          player.isFolded = true;
          player.isActive = false;
          player.actionLabel = 'Fold';
          break;

        case 'win':
          // For winning, we give them the pot
          // Note: This logic assumes 'win' action amount is the pot share
          // We reset the pot for display purposes if we want to show it moving
          // Or we keep it in pot but mark player as winner?
          // Let's add to their stack and zero the pot in next step or now.
          // Since this is a replayer state, we can just say pot is gone to this player.
          
          // However, we calculate pot *after* this loop based on bets.
          // So we need to explicitly subtract from pot or handle it.
          // Simpler: Just mark them as winner and add to stack.
          // But 'pot' variable is calculated from bets. 
          // If we want to show 0 pot, we need a flag.
          
          // Let's modify the pot calculation below.
          player.isWinner = true;
          player.wonAmount = action.amount;
          player.currentStack += action.amount;
          player.actionLabel = `Win ${action.amount}`;
          
          // We need to reduce the "pot" variable by this amount so it doesn't show in center?
          // The pot variable is sum of bets + initial pot.
          // If we want to "move" chips, we should deduct from pot.
          pot -= action.amount;
          break;
      }
    }
  }

  // Calculate total pot including current bets
  // If we had a 'win' action, we already deducted from 'pot' variable.
  // But we also add currentBets. At end of hand (win), currentBets should be 0 (collected).
  // Win actions happen after bets are gathered usually?
  // In our simple model, bets stay in 'currentBet' until street change.
  // 'win' is street 4. Street change 3->4 should have cleared bets.
  
  const currentPot = Math.max(0, pot + players.reduce((sum, p) => sum + p.currentBet, 0));

  return {
    players,
    pot: currentPot,
    communityCards,
    currentStreet,
    dealerSeat: hand.buttonSeat, // Need to ensure this is in hand model
    showVillainHands,
    showInBB,
    bbSize: hand.blinds.bb
  };
};

// Video Recording Function
// Keep recorder in module scope to avoid IPC cloning issues
let currentRecorder = null;
let currentStream = null;

async function startVideoRecording(exportType) {
  console.log('[VideoExport] Starting video recording, type:', exportType);
  
  const isElectron = typeof window !== 'undefined' && window.process?.versions?.electron;
  const isDev = import.meta.env.DEV;
  
  console.log('[VideoExport] Environment - isElectron:', isElectron, 'isDev:', isDev);

  if (isDev && !isElectron) {
    console.log('[VideoExport] Development mode: Simulating video recording...');
    await simulateRecording(exportType);
    return;
  }

  if (!isElectron) {
    throw new Error('Electron environment not detected. Video export only works in Electron app.');
  }

  let stream = null;
  
  try {
    // First, get available sources using IPC
    console.log('[VideoExport] Getting desktop sources via IPC...');
    let sources = [];
    try {
      const sourcesResult = await ipcService.getRecordableWindows();
      if (sourcesResult && Array.isArray(sourcesResult)) {
        sources = sourcesResult;
        console.log('[VideoExport] Got', sources.length, 'desktop sources');
      }
    } catch (sourcesError) {
      console.log('[VideoExport] Could not get sources via IPC:', sourcesError.message);
    }

    // Try Electron-specific getUserMedia with chromeMediaSource first
    if (sources.length > 0) {
      console.log('[VideoExport] Trying Electron-specific capture with source:', sources[0].name);
      try {
        // Use the first available window/source
        const sourceId = sources[0].id;
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
              minWidth: 1280,
              maxWidth: 1920,
              minHeight: 720,
              maxHeight: 1080,
              minFrameRate: 30,
              maxFrameRate: 30
            }
          },
          audio: false
        });
        console.log('[VideoExport] Electron-specific capture succeeded, stream active:', !!stream);
      } catch (electronError) {
        console.log('[VideoExport] Electron capture failed:', electronError.message);
      }
    }

    // Fallback to getDisplayMedia if Electron-specific method didn't work
    if (!stream) {
      console.log('[VideoExport] Falling back to getDisplayMedia...');
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'window',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: false
      });
      console.log('[VideoExport] getDisplayMedia succeeded, stream active:', !!stream);
    }
  } catch (e) {
    let errorMsg = 'Failed to capture screen';
    let isUserCancelled = false;
    
    try {
      if (e instanceof Error) {
        errorMsg = e.message;
        if (e.name === 'AbortError' || e.message.includes('cancel')) {
          isUserCancelled = true;
        }
      } else if (typeof e === 'string') {
        errorMsg = e;
        if (e.includes('cancel') || e.includes('abort')) {
          isUserCancelled = true;
        }
      } else if (e && typeof e === 'object') {
        errorMsg = e.message || e.name || JSON.stringify(e);
        if (e.name === 'AbortError') isUserCancelled = true;
      }
    } catch (extractError) {
      // Ignore
    }
    
    console.error('[VideoExport] getDisplayMedia failed:', errorMsg);
    if (isUserCancelled) {
      console.log('[VideoExport] User cancelled screen capture');
      return;
    }
    throw new Error('Échec de la capture d\'écran: ' + errorMsg);
  }

  if (!stream) {
    console.log('[VideoExport] No stream returned, user may have cancelled');
    return;
  }

  // Handle case where user stops sharing immediately
  stream.getVideoTracks()[0].onended = () => {
    console.log('[VideoExport] User stopped sharing');
  };

  // Import RecordRTC dynamically
  let RecordRTC;
  try {
    const module = await import('recordrtc');
    RecordRTC = module.default;
    console.log('[VideoExport] RecordRTC loaded, version:', RecordRTC.version);
  } catch (e) {
    let errMsg = 'Failed to load recording library';
    try { errMsg = e?.message || String(e); } catch {}
    console.error('[VideoExport] Failed to load RecordRTC:', errMsg);
    throw new Error(errMsg);
  }

  // Create recorder
  console.log('[VideoExport] Creating recorder...');
  let recorder;
  try {
    recorder = new RecordRTC(stream, {
      type: 'video',
      mimeType: 'video/webm;codecs=vp9',
      recorderType: RecordRTC.MediaStreamRecorder
    });
    console.log('[VideoExport] Recorder created successfully');
  } catch (e) {
    let errMsg = 'Failed to create recorder';
    try { errMsg = e?.message || String(e); } catch {}
    console.error('[VideoExport] Failed to create recorder:', errMsg);
    stream.getTracks().forEach(t => t.stop());
    throw new Error('Failed to create recorder: ' + errMsg);
  }

  // Start recording
  console.log('[VideoExport] Starting recording...');
  try {
    recorder.startRecording();
    console.log('[VideoExport] Recording started');
  } catch (e) {
    let errMsg = 'Failed to start recording';
    try { errMsg = e?.message || String(e); } catch {}
    console.error('[VideoExport] Failed to start recording:', errMsg);
    stream.getTracks().forEach(t => t.stop());
    throw new Error('Failed to start recording: ' + errMsg);
  }

  // Store recorder in module variable (not in Zustand to avoid IPC cloning issues)
  currentRecorder = recorder;
  currentStream = stream;

  // Start playback
  const store = useReplayerStore.getState();
  console.log('[VideoExport] Starting playback for recording...');
  store.setPlaybackSpeed(2); // 2x speed for export
  if (exportType === 'hand') {
    store.jumpToStep(-1); // Start from beginning of current hand
  }
  store.togglePlay(); // Start playing

  // Wait for completion with timeout
  console.log('[VideoExport] Waiting for replay to complete...');
  const maxRecordingTime = 5 * 60 * 1000; // 5 minutes max
  const startTime = Date.now();
  
  const waitForCompletion = new Promise((resolve, reject) => {
    let streamEnded = false;
    
    // Listen for stream ended (user clicked "Stop sharing")
    if (stream && stream.getVideoTracks()[0]) {
      stream.getVideoTracks()[0].onended = () => {
        console.log('[VideoExport] Screen sharing ended by user');
        streamEnded = true;
        resolve();
      };
    }
    
    const checkCompletion = () => {
      // Check timeout
      if (Date.now() - startTime > maxRecordingTime) {
        console.log('[VideoExport] Recording timeout reached');
        resolve();
        return;
      }
      
      // Check if stream ended
      if (streamEnded) {
        return;
      }
      
      const state = useReplayerStore.getState();
      const { hand, currentActionIndex, handQueue, currentHandIndex, isPlaying } = state;

      if (!hand) {
        setTimeout(checkCompletion, 100);
        return;
      }

      if (exportType === 'hand') {
        if (currentActionIndex >= hand.actions.length - 1 && !isPlaying) {
          console.log('[VideoExport] Hand recording complete');
          resolve();
          return;
        }
      } else {
        if (currentHandIndex >= handQueue.length - 1 && currentActionIndex >= hand.actions.length - 1 && !isPlaying) {
          console.log('[VideoExport] Tournament recording complete');
          resolve();
          return;
        }
      }

      setTimeout(checkCompletion, 100);
    };
    checkCompletion();
  });

  try {
    await waitForCompletion;
  } catch (e) {
    console.error('[VideoExport] Error during wait:', e);
  }

  // Stop recording and save
  console.log('[VideoExport] Stopping recorder...');
  
  return new Promise((resolve, reject) => {
    recorder.stopRecording(async () => {
      console.log('[VideoExport] Recorder stopped, getting blob...');
      const blob = recorder.getBlob();
      
      if (!blob) {
        console.error('[VideoExport] No blob generated');
        reject(new Error('No video data generated'));
        return;
      }
      
      console.log('[VideoExport] Blob size:', blob.size, 'type:', blob.type);
      
      // Convert blob to base64 for IPC transfer
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64data = reader.result.split(',')[1];
        console.log('[VideoExport] Converted to base64, length:', base64data.length);
        
        try {
          // Use direct ipcRenderer invoke to avoid any wrapper issues
          console.log('[VideoExport] Sending to main process...');
          
          // Ensure we have valid serializable data
          const payload = {
            videoData: String(base64data),
            exportType: String(exportType)
          };
          
          console.log('[VideoExport] Payload prepared, videoData length:', payload.videoData.length);
          
          // Direct IPC call - avoid any potential wrapper issues
          const { ipcRenderer } = window.require('electron');
          const result = await ipcRenderer.invoke('save-video', payload);

          console.log('[VideoExport] Save result:', result);

          if (result.success) {
            console.log('[VideoExport] Video saved successfully to:', result.filePath);
            alert('Vidéo enregistrée avec succès !');
          } else {
            console.error('[VideoExport] Failed to save video:', result.message);
            alert('Erreur lors de l\'enregistrement: ' + result.message);
          }
        } catch (saveError) {
          let errMsg = 'Failed to save video';
          try { errMsg = saveError?.message || String(saveError); } catch {}
          console.error('[VideoExport] Error saving video:', errMsg);
          alert('Erreur lors de l\'enregistrement vidéo: ' + errMsg);
        }
      };
      reader.onerror = () => {
        console.error('[VideoExport] FileReader error');
        // Don't reject - just show error, don't break the UI
      };
      reader.readAsDataURL(blob);
      
      // Cleanup stream after a delay to ensure recording is done
      setTimeout(() => {
        if (stream) {
          try {
            stream.getTracks().forEach(track => track.stop());
          } catch (e) {
            console.log('[VideoExport] Stream cleanup error:', e);
          }
        }
        currentRecorder = null;
        currentStream = null;
      }, 1000);
    });
  });
}

// Development Simulation Function
async function simulateRecording(exportType) {
  const store = useReplayerStore.getState();
  
  // Start playback
  store.setPlaybackSpeed(2); // 2x speed for export
  if (exportType === 'hand') {
    store.jumpToStep(-1); // Start from beginning of current hand
  }
  store.togglePlay(); // Start playing

  // Simulate recording duration
  const waitForCompletion = new Promise((resolve) => {
    const checkCompletion = () => {
      const state = useReplayerStore.getState();
      const { hand, currentActionIndex, handQueue, currentHandIndex, isPlaying } = state;

      if (exportType === 'hand') {
        if (currentActionIndex >= hand.actions.length - 1 && !isPlaying) {
          resolve();
          return;
        }
      } else {
        if (currentHandIndex >= handQueue.length - 1 && currentActionIndex >= hand.actions.length - 1 && !isPlaying) {
          resolve();
          return;
        }
      }

      setTimeout(checkCompletion, 100);
    };
    checkCompletion();
  });

  await waitForCompletion;

  // Simulate download
  console.log('Development mode: Simulating video download...');
  
  // Prompt for filename
  const defaultName = `poker-replay-${exportType}-simulation-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
  const filename = prompt('Enter filename for the video export (simulation):', defaultName);
  
  if (!filename) return; // User cancelled
  
  // Create a dummy video blob for simulation
  const dummyContent = 'This is a simulated video file for development testing.';
  const blob = new Blob([dummyContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  
  alert('Development mode: Video export simulated successfully! The file has been downloaded.');
}
