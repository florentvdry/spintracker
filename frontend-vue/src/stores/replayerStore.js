import { defineStore } from 'pinia'
import { ipcService } from '@/services/ipcService'

export const useReplayerStore = defineStore('replayer', {
  state: () => ({
    handId: null,
    handData: null,
    loading: false,
    error: null,
    currentIndex: 0,
    isPlaying: false,
    playbackSpeed: 1000,
    timer: null,
    
    // Queue support
    handQueue: [], // Array of hand IDs
    queueIndex: 0,
    heroName: null,
    
    // Derived state for current step
    players: [],
    pot: 0,
    board: [],
    street: 'Preflop',
    actionLog: [],
    viewMode: 'chips', // 'chips' or 'bb'
    showFoldedPlayers: true
  }),

  persist: {
    paths: ['viewMode', 'showFoldedPlayers']
  },

  getters: {
    currentAction: (state) => {
      if (!state.handData || state.currentIndex === 0) return null
      const actions = state.handData.actions || state.handData.Actions || []
      return actions[state.currentIndex - 1]
    },
    totalActions: (state) => {
      const actions = state.handData?.actions || state.handData?.Actions || []
      return actions.length || 0
    },
    progress: (state) => {
      if (!state.handData) return 0
      const actions = state.handData.actions || state.handData.Actions || []
      return (state.currentIndex / actions.length) * 100
    }
  },

  actions: {
    async loadHand(handId, heroName = null) {
      this.loading = true
      this.error = null
      this.currentIndex = 0
      this.stop()
      
      try {
        const response = await ipcService.getHandReplay(handId, heroName)
        if (response.success) {
          this.handData = response.data
          this.handId = handId
          this.resetTable()
        } else {
          this.error = response.error || 'Failed to load hand'
        }
      } catch (err) {
        this.error = err.message
      } finally {
        this.loading = false
      }
    },

    setHand(handData) {
      this.stop()
      this.error = null
      this.loading = false
      // Normalize property names from PascalCase (C#) to camelCase (JS)
      this.handData = {
        ...handData,
        players: handData.players || handData.Players || [],
        actions: handData.actions || handData.Actions || []
      }
      this.handId = handData.id || handData.handId || handData.HandId
      this.resetTable()
    },

    resetTable() {
      if (!this.handData) return
      
      this.currentIndex = 0
      this.pot = 0
      this.board = []
      this.street = 'Preflop'
      this.actionLog = []
      
      // Initialize players with initial stacks
      const players = this.handData.players || this.handData.Players || []
      this.players = players.map(p => ({
        ...p,
        currentStack: p.initialStack || p.InitialStack || 0,
        bet: 0,
        isFolded: false,
        isAllIn: false,
        isActive: false,
        showCards: false
      }))

      // Auto-apply setup actions (Blinds, DealCards Preflop)
      const actions = this.handData.actions || this.handData.Actions || []
      while (this.currentIndex < actions.length) {
        const action = actions[this.currentIndex]
        if (this.isRealAction(action)) break
        
        this.applyAction(action)
        this.currentIndex++
      }
    },

    isRealAction(action) {
      const realTypes = ['Bet', 'Call', 'Raise', 'Fold', 'Check', 'AllIn']
      return realTypes.includes(action.type)
    },

    nextStep() {
      if (!this.handData || this.currentIndex >= this.handData.actions.length) {
        this.stop()
        return
      }

      const action = this.handData.actions[this.currentIndex]
      this.applyAction(action)
      this.currentIndex++
    },

    prevStep() {
      if (this.currentIndex <= 0) return
      
      this.currentIndex--
      this.rebuildStateToCurrentIndex()
    },

    rebuildStateToCurrentIndex() {
      const targetIndex = this.currentIndex
      
      this.currentIndex = 0
      this.pot = 0
      this.board = []
      this.street = 'Preflop'
      this.actionLog = []
      this.players = this.handData.players.map(p => ({
        ...p,
        currentStack: p.initialStack,
        bet: 0,
        isFolded: false,
        isAllIn: false,
        isActive: false,
        showCards: false
      }))

      for (let i = 0; i < targetIndex; i++) {
        this.applyAction(this.handData.actions[i])
      }
      this.currentIndex = targetIndex
    },

    applyAction(action) {
      this.street = action.street
      this.actionLog.push(action)

      const player = this.players.find(p => p.name === action.playerName)

      switch (action.type) {
        case 'PostSB':
        case 'PostBB':
        case 'Bet':
        case 'Raise':
        case 'Call':
          if (player) {
            const diff = action.amount - player.bet
            player.currentStack -= diff
            player.bet = action.amount
            if (action.potAfter) this.pot = action.potAfter
          }
          break;

        case 'AllIn':
          if (player) {
            const allInAmount = player.currentStack
            player.currentStack = 0
            player.bet += allInAmount
            player.isAllIn = true
            if (action.potAfter) this.pot = action.potAfter
          }
          break;

        case 'Fold':
          if (player) {
            player.isFolded = true
            player.bet = 0
          }
          break;

        case 'Check':
          if (player) player.bet = 0
          break;

        case 'DealCards':
          if (action.street !== 'Preflop') {
            this.players.forEach(p => p.bet = 0)
          }
          if (action.cards) {
            const newCards = action.cards.match(/.{1,2}/g) || []
            this.board = [...this.board, ...newCards]
          }
          break;

        case 'ShowCards':
          if (player) player.showCards = true
          break;

        case 'CollectPot':
          this.players.forEach(p => p.bet = 0)
          
          if (action.playerName) {
              const winner = this.players.find(p => p.name === action.playerName)
              if (winner) winner.currentStack += action.amount
          } else {
              this.players.forEach(p => {
                  if (action.description.toLowerCase().includes(p.name.toLowerCase()) && 
                      action.description.toLowerCase().includes('wins')) {
                      p.currentStack += action.amount
                  }
              })
          }
          this.pot = 0
          break;
      }

      this.players.forEach(p => p.isActive = (p.name === action.playerName))
    },

    play() {
      if (this.isPlaying) return
      this.isPlaying = true
      
      this.timer = setInterval(() => {
        if (this.currentIndex >= this.totalActions) {
          this.stop()
        } else {
          this.nextStep()
        }
      }, this.playbackSpeed)
    },

    stop() {
      this.isPlaying = false
      if (this.timer) {
        clearInterval(this.timer)
        this.timer = null
      }
    },

    setSpeed(ms) {
      this.playbackSpeed = ms
      if (this.isPlaying) {
        this.stop()
        this.play()
      }
    },

    jumpTo(index) {
      this.currentIndex = index
      this.rebuildStateToCurrentIndex()
    },

    async loadHandQueue(data) {
      this.handQueue = data.handIds || []
      this.queueIndex = data.startIndex || 0
      this.heroName = data.heroName
      
      if (this.handQueue.length > 0) {
        const handIdToLoad = this.handQueue[this.queueIndex]
        await this.loadHand(handIdToLoad, this.heroName)
      }
    },

    async nextHand() {
      if (this.queueIndex < this.handQueue.length - 1) {
        this.queueIndex++
        const nextHandId = this.handQueue[this.queueIndex]
        await this.loadHand(nextHandId, this.heroName)
      }
    },

    async prevHand() {
      if (this.queueIndex > 0) {
        this.queueIndex--
        const prevHandId = this.handQueue[this.queueIndex]
        await this.loadHand(prevHandId, this.heroName)
      }
    },

    async openReplayerWindowForQueue(handIds, startIndex, heroName) {
      ipcService.invoke('open-replayer', {
        handIds,
        startIndex,
        heroName
      })
    },

    async openSingleHandReplayer(handId, heroName = null) {
      this.loading = true
      try {
        const response = await ipcService.getHandReplay(handId, heroName || this.heroName)
        if (response.success) {
          ipcService.invoke('open-replayer', response.data)
        } else {
          this.error = response.error || 'Failed to get hand details for replayer'
        }
      } catch (err) {
        this.error = err.message
      } finally {
        this.loading = false
      }
    }
  }
      })
