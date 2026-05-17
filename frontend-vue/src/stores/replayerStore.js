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
      if (!state.handData) return null
      const actions = state.handData.actions || state.handData.Actions || []
      if (state.currentIndex >= actions.length) return null
      return actions[state.currentIndex]
    },
    totalActions: (state) => {
      if (!state.handData) return 0
      return state.handData.actions.filter(a => {
        const setupTypes = ['PostSB', 'PostBB', 'DealCards']
        return !setupTypes.includes(a.type)
      }).length
    },
    progress: (state) => {
      if (!state.handData) return 0
      const realActions = state.handData.actions.filter(a => {
        const setupTypes = ['PostSB', 'PostBB', 'DealCards']
        return !setupTypes.includes(a.type)
      })
      const currentIndex = realActions.findIndex((a, i) => i >= state.currentIndex - 1)
      return currentIndex >= 0 ? ((currentIndex + 1) / realActions.length) * 100 : 0
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
      console.log('ReplayerStore: setHand started');
      console.log('ReplayerStore: handData keys:', Object.keys(handData));
      
      this.stop()
      this.error = null
      this.loading = false
      
      // Normalize property names
      const normalizedData = {
        ...handData,
        players: handData.players || handData.Players || [],
        actions: handData.actions || handData.Actions || []
      }
      
      this.handData = normalizedData
      this.handId = handData.id || handData.handId || handData.HandId
      
      console.log('ReplayerStore: setHand finished. handId:', this.handId, 'handData set:', !!this.handData);
      
      this.resetTable()
    },

    resetTable() {
      if (!this.handData) {
          console.log('ReplayerStore: resetTable, handData is null/undefined')
          return
      }
      console.log('ReplayerStore: resetTable started')
      
      this.currentIndex = 0
      this.pot = 0
      this.board = []
      this.street = 'Preflop'
      this.actionLog = []
      
      console.log('ReplayerStore: resetTable, mapping players')
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

      console.log('ReplayerStore: resetTable, actions processed')
      const actions = this.handData.actions || this.handData.Actions || []
      const firstRealIndex = this.getFirstRealActionIndex()
      
      console.log('ReplayerStore: resetTable, firstRealIndex:', firstRealIndex)
      
      let i = 0
      while (i < firstRealIndex) {
        const action = actions[i]
        console.log('ReplayerStore: resetTable, applying setup action', i, action.type, 'cards:', action.cards, 'action:', JSON.stringify(action))
        this.applyAction(action)
        this.currentIndex++
        i++
      }
      console.log('ReplayerStore: resetTable finished, board state:', this.board)
    },

    isRealAction(action) {
      const setupTypes = ['PostSB', 'PostBB']
      return !setupTypes.includes(action.type)
    },

    findNextRealActionIndex(fromIndex) {
      for (let i = fromIndex; i < this.handData.actions.length; i++) {
        if (this.isRealAction(this.handData.actions[i])) return i
      }
      return this.handData.actions.length
    },

    findPrevRealActionIndex(fromIndex) {
      for (let i = fromIndex - 1; i >= 0; i--) {
        if (this.isRealAction(this.handData.actions[i])) return i
      }
      return 0
    },

    getFirstRealActionIndex() {
      return this.findNextRealActionIndex(0)
    },

    getTotalRealActions() {
      if (!this.handData) return 0
      return this.handData.actions.filter(a => this.isRealAction(a)).length
    },

    nextStep() {
      if (!this.handData) return
      
      if (this.currentIndex >= this.handData.actions.length) {
        this.stop()
        return
      }

      const nextRealIndex = this.findNextRealActionIndex(this.currentIndex)
      if (nextRealIndex >= this.handData.actions.length) {
        this.stop()
        return
      }

      const action = this.handData.actions[nextRealIndex]
      this.applyAction(action)
      this.currentIndex = nextRealIndex + 1
    },

    prevStep() {
      if (!this.handData) return
      
      const firstRealIndex = this.getFirstRealActionIndex()
      if (this.currentIndex <= firstRealIndex + 1) {
        this.resetTable()
        return
      }
      
      this.currentIndex--
      while (this.currentIndex > firstRealIndex + 1 && !this.isRealAction(this.handData.actions[this.currentIndex - 1])) {
        this.currentIndex--
      }
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
          // Si on passe à une nouvelle street, reset les bets
          if (action.street !== 'Preflop') {
            this.players.forEach(p => p.bet = 0)
          }
          // Mise à jour du board
          if (action.cards) {
            const newCards = action.cards.match(/.{1,2}/g) || []
            this.board = [...this.board, ...newCards]
          } else if (action.description && action.description.includes(':')) {
            // Tentative de parsing fallback si cards est null mais présent dans la description
            const parts = action.description.split(':')
            if (parts.length > 1) {
                const cardStr = parts[1].trim().replace(/\s+/g, '')
                const newCards = cardStr.match(/.{1,2}/g) || []
                this.board = [...this.board, ...newCards]
            }
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

    jumpToRealAction(realActionIndex) {
      let count = 0
      for (let i = 0; i < this.handData.actions.length; i++) {
        if (this.isRealAction(this.handData.actions[i])) {
          if (count === realActionIndex) {
            this.currentIndex = i
            this.rebuildStateToCurrentIndex()
            return
          }
          count++
        }
      }
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
      // Load the first hand data to send with the queue
      const firstHandId = handIds[startIndex] || handIds[0]
      if (!firstHandId) return
      
      try {
        const response = await ipcService.getHandReplay(firstHandId, heroName)
        if (response.success) {
          // Send both queue info AND the loaded hand data
          ipcService.invoke('open-replayer', {
            handIds,
            startIndex,
            heroName,
            // Include the actual hand data (response.data is the hand)
            ...response.data
          })
        }
      } catch (err) {
        console.error('Failed to load first hand for queue:', err)
        // Fallback: open with just queue info
        ipcService.invoke('open-replayer', {
          handIds,
          startIndex,
          heroName
        })
      }
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
