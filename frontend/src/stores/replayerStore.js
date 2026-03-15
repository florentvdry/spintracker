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
    const { currentActionIndex, hand, handQueue, currentHandIndex } = get();
    if (hand && currentActionIndex < hand.actions.length - 1) {
      set({ currentActionIndex: currentActionIndex + 1 });
    } else {
      set({ isPlaying: false });
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

export const selectReplayerState = (state) => {
  const { hand, currentActionIndex, isPlaying, playbackSpeed, showVillainHands, showInBB, handQueue, currentHandIndex } = state;
  
  if (!hand) return null;
  
  // Compute derived state for ReplayerTable
  const players = hand.players || [];
  const board = hand.board || [];
  const actions = hand.actions || [];
  const blinds = hand.blinds || { bb: 0 };
  const bbSize = blinds.bb || 0;
  const dealerSeat = hand.buttonSeat || 1;
  
  // Calculate current street based on action index
  let currentStreet = 0;
  if (currentActionIndex >= 0 && actions.length > 0) {
    const currentAction = actions[currentActionIndex];
    if (currentAction) {
      currentStreet = currentAction.street !== undefined ? currentAction.street : 0;
    }
  }
  
  // Calculate pot and player states based on current action
  let pot = 0;
  const currentPlayers = players.map(p => ({
    ...p,
    currentStack: p.stack || 0,
    currentBet: 0,
    isFolded: false,
    isWinner: false,
    actionLabel: null,
    lastActionType: null,
    cards: p.cards
  }));
  
  // Process actions up to current index
  for (let i = 0; i <= currentActionIndex && i < actions.length; i++) {
    const action = actions[i];
    if (!action) continue;
    
    const player = currentPlayers.find(p => p.name === action.player);
    if (!player) continue;
    
    switch (action.type) {
      case 'post':
        player.currentStack -= action.amount;
        player.currentBet += action.amount;
        pot += action.amount;
        break;
      case 'fold':
        player.isFolded = true;
        break;
      case 'check':
        player.actionLabel = 'Check';
        player.lastActionType = 'check';
        break;
      case 'call':
        const callAmount = action.amount || 0;
        player.currentStack -= callAmount;
        player.currentBet += callAmount;
        pot += callAmount;
        player.actionLabel = `Call ${callAmount}`;
        player.lastActionType = 'call';
        break;
      case 'bet':
        player.currentStack -= action.amount;
        player.currentBet += action.amount;
        pot += action.amount;
        player.actionLabel = `Bet ${action.amount}`;
        player.lastActionType = 'bet';
        break;
      case 'raise':
        player.currentStack -= action.amount;
        player.currentBet += action.amount;
        pot += action.amount;
        player.actionLabel = `Raise ${action.amount}`;
        player.lastActionType = 'raise';
        break;
      case 'all-in':
        const allInAmount = action.amount || player.currentStack;
        player.currentStack -= allInAmount;
        player.currentBet += allInAmount;
        pot += allInAmount;
        player.actionLabel = `All-In ${allInAmount}`;
        player.lastActionType = 'all-in';
        break;
      case 'win':
      case 'showdown':
      case 'summary':
        // Determine winners from action text
        if (action.player) {
          const winner = currentPlayers.find(p => p.name === action.player);
          if (winner) {
            winner.isWinner = true;
            winner.currentStack += action.amount || 0;
          }
        }
        player.actionLabel = `Wins ${action.amount || 0}`;
        player.lastActionType = 'win';
        break;
    }
  }
  
  // Get community cards based on current street
  let communityCards = [];
  if (currentStreet >= 1 && board.length >= 3) {
    communityCards = board.slice(0, 3);
  }
  if (currentStreet >= 2 && board.length >= 4) {
    communityCards = board.slice(0, 4);
  }
  if (currentStreet >= 3 && board.length >= 5) {
    communityCards = board.slice(0, 5);
  }
  
  return {
    hand,
    players: currentPlayers,
    pot,
    communityCards,
    dealerSeat,
    showVillainHands,
    currentStreet,
    showInBB,
    bbSize,
    currentActionIndex,
    isPlaying,
    playbackSpeed,
    handQueue,
    currentHandIndex
  };
};
