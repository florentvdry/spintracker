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

  // Recording State
  isRecording: false,
  recorder: null,
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

  exportVideo: async () => {
    const { handQueue, currentHandIndex, hand } = get();
    if (!hand) return;

    let exportType = 'hand';
    if (handQueue.length > 1) {
      // Ask user what to export
      const choice = window.confirm('Exporter la main actuelle ou tout le tournoi?\n\nOK = Main actuelle\nAnnuler = Tout le tournoi');
      exportType = choice ? 'hand' : 'tournament';
    }

    // Start recording
    set({ isRecording: true, recordingType: exportType });
    
    try {
      await startVideoRecording(exportType);
    } catch (error) {
      console.error('Video export failed:', error);
      alert('Erreur lors de l\'export vidéo: ' + error.message);
    } finally {
      set({ isRecording: false, recordingType: null });
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
        // We call openReplayer but passing a flag or rely on it not clearing queue if we don't tell it to
        // Actually openReplayer currently doesn't touch queue, which is good.
        get().openReplayer(res.data);
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
    // Open replayer in a new window
    const newWindow = window.open('/replayer.html', '_blank', 'width=1000,height=700,resizable=yes,scrollbars=no');
    
    // Wait for the window to load, then send the data
    const checkReady = () => {
      if (newWindow && !newWindow.closed) {
        try {
          newWindow.postMessage({ type: 'loadReplayer', data: handData }, '*');
        } catch (e) {
          // Window not ready, try again
          setTimeout(checkReady, 100);
        }
      }
    };
    setTimeout(checkReady, 500); // Give some time for the window to load
  },

  setReplayerHand: (handData) => {
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
      handQueue: state.isLoadingHand ? state.handQueue : [],
      currentHandIndex: state.isLoadingHand ? state.currentHandIndex : -1
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
async function startVideoRecording(exportType) {
  const isElectron = window.process && window.process.versions && window.process.versions.electron;
  const isDev = import.meta.env.DEV; // Vite dev mode
  let stream;

  if (isDev && !isElectron) {
    // Development mode in browser - simulate recording
    console.log('Development mode: Simulating video recording...');
    
    // Simulate the recording process
    await simulateRecording(exportType);
    return;
  }

  if (isElectron && window.opener) {
    // Electron separate window mode - use desktopCapturer
    const { desktopCapturer } = require('electron');

    // Get screen sources
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 0, height: 0 }
    });

    // Find replayer window
    const replayerSource = sources.find(source => source.name.includes('Hand Replayer') || source.name.includes('replayer'));
    if (!replayerSource) {
      throw new Error('Replayer window not found. Please ensure the replayer is open.');
    }

    // Get media stream
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: replayerSource.id,
          minWidth: 1280,
          maxWidth: 1920,
          minHeight: 720,
          maxHeight: 1080
        }
      }
    });
  } else {
    // Browser mode or modal mode - use getDisplayMedia (user selects what to record)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      throw new Error('Screen recording is not supported in this browser. Please use a modern browser like Chrome 72+, Firefox 66+, or run the Electron app for full functionality.');
    }
    
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { mediaSource: 'screen' },
        audio: false
      });
    } catch (error) {
      if (error.name === 'NotAllowedError') {
        throw new Error('Screen recording permission was denied. Please allow screen sharing when prompted to export video.');
      } else if (error.name === 'NotFoundError') {
        throw new Error('No screen sharing source found. Please ensure you have a screen or window to share.');
      } else if (error.message.includes('Not supported') || error.name === 'NotSupportedError') {
        throw new Error('Screen recording is not supported in this browser environment. Please use Chrome, Firefox, or the Electron app.');
      } else {
        throw new Error(`Screen recording failed: ${error.message}`);
      }
    }
  }

  // Import RecordRTC dynamically
  const RecordRTC = (await import('recordrtc')).default;

  // Create recorder
  const recorder = new RecordRTC(stream, {
    type: 'video',
    mimeType: 'video/webm;codecs=vp9',
    recorderType: RecordRTC.MediaStreamRecorder
  });

  // Store recorder in state
  useReplayerStore.setState({ recorder });

  // Start recording
  recorder.startRecording();

  // Start playback
  const store = useReplayerStore.getState();
  store.setPlaybackSpeed(2); // 2x speed for export
  if (exportType === 'hand') {
    store.jumpToStep(-1); // Start from beginning of current hand
  } // For tournament, continue from current position or start current hand
  store.togglePlay(); // Start playing

  // Wait for completion
  const waitForCompletion = new Promise((resolve) => {
    const checkCompletion = () => {
      const state = useReplayerStore.getState();
      const { hand, currentActionIndex, handQueue, currentHandIndex, isPlaying } = state;

      if (exportType === 'hand') {
        // Check if current hand is finished
        if (currentActionIndex >= hand.actions.length - 1 && !isPlaying) {
          resolve();
          return;
        }
      } else {
        // Tournament: check if all hands finished
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

  // Stop recording
  recorder.stopRecording(() => {
    const blob = recorder.getBlob();
    
    // Prompt for filename
    const defaultName = `poker-replay-${exportType}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
    const filename = prompt('Enter filename for the video export:', defaultName);
    
    if (!filename) return; // User cancelled
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    
    // Cleanup
    URL.revokeObjectURL(url);
    stream.getTracks().forEach(track => track.stop());
    useReplayerStore.setState({ recorder: null, recordingType: null });
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
