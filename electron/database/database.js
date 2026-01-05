const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

class PokerDatabase {
  constructor() {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'poker_tracker.db');
    this.db = new Database(dbPath);
    this.initializeTables();
  }

  initializeTables() {
    // Table de configuration pour stocker la version du parser
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    // Table des sessions
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        room TEXT NOT NULL,
        game_type TEXT NOT NULL,
        hands_played INTEGER DEFAULT 0,
        profit REAL DEFAULT 0,
        ev_profit REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table des mains
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hands (
        id TEXT PRIMARY KEY,
        session_id INTEGER,
        game_id TEXT,
        hand_id TEXT,
        room TEXT,
        game_mode TEXT,
        game_type TEXT,
        game_name TEXT,
        prize_pool REAL,
        multiplier INTEGER,
        buy_in REAL,
        date_time TEXT,
        table_id TEXT,
        blinds TEXT,
        total_pot REAL,
        rake REAL,
        hero_position TEXT,
        hero_stack INTEGER,
        hero_cards TEXT,
        villain_position TEXT,
        villain_stack INTEGER,
        villain_cards TEXT,
        preflop_action TEXT,
        flop TEXT,
        flop_action TEXT,
        turn TEXT,
        turn_action TEXT,
        river TEXT,
        river_action TEXT,
        showdown TEXT,
        result TEXT,
        hero_profit REAL,
        hero_all_in BOOLEAN DEFAULT 0,
        villain_all_in BOOLEAN DEFAULT 0,
        ev_chips REAL,
        leak_detected TEXT,
        error_type TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);

    // Table des joueurs
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        total_hands INTEGER DEFAULT 0,
        total_profit REAL DEFAULT 0,
        total_ev_profit REAL DEFAULT 0,
        vpip REAL DEFAULT 0,
        pfr REAL DEFAULT 0,
        three_bet REAL DEFAULT 0,
        cbet REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table des statistiques
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS statistics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER,
        position TEXT,
        action_type TEXT,
        hand_range TEXT,
        frequency INTEGER DEFAULT 0,
        ev_total REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (player_id) REFERENCES players(id)
      )
    `);

    // Table des leaks détectés
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS leaks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hand_id TEXT,
        player_id INTEGER,
        leak_type TEXT,
        severity TEXT,
        description TEXT,
        expected_action TEXT,
        actual_action TEXT,
        ev_loss REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (hand_id) REFERENCES hands(id),
        FOREIGN KEY (player_id) REFERENCES players(id)
      )
    `);

    // Index pour les performances
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_hands_session ON hands(session_id);
      CREATE INDEX IF NOT EXISTS idx_hands_date ON hands(date_time);
      CREATE INDEX IF NOT EXISTS idx_hands_hero_position ON hands(hero_position);
      CREATE INDEX IF NOT EXISTS idx_leaks_hand ON leaks(hand_id);
      CREATE INDEX IF NOT EXISTS idx_leaks_player ON leaks(player_id);
    `);
  }

  insertHandsBatch(handsData) {
    const insertMany = this.db.transaction((hands) => {
      let inserted = 0;
      for (const hand of hands) {
        if (this.insertHand(hand)) {
          inserted++;
        }
      }
      return inserted;
    });
    return insertMany(handsData);
  }

  insertHand(handData) {
    if (!this.insertHandStmt) {
      this.insertHandStmt = this.db.prepare(`
        INSERT INTO hands (
          id, game_id, hand_id, room, game_mode, game_type, game_name,
          prize_pool, multiplier, buy_in, date_time, table_id, blinds,
          total_pot, rake, hero_position, hero_stack, hero_cards,
          villain_position, villain_stack, villain_cards, preflop_action,
          flop, flop_action, turn, turn_action, river, river_action,
          showdown, result, hero_profit, hero_all_in, villain_all_in, ev_chips
        ) VALUES (
          @id, @game_id, @hand_id, @room, @game_mode, @game_type, @game_name,
          @prize_pool, @multiplier, @buy_in, @date_time, @table_id, @blinds,
          @total_pot, @rake, @hero_position, @hero_stack, @hero_cards,
          @villain_position, @villain_stack, @villain_cards, @preflop_action,
          @flop, @flop_action, @turn, @turn_action, @river, @river_action,
          @showdown, @result, @hero_profit, @hero_all_in, @villain_all_in, @ev_chips
        )
      `);
    }

    try {
      // Calculer l'EV chips lors de l'import (une seule fois)
      const evChips = this.calculateHandEV(handData);
      
      // Convert boolean values to integers for SQLite compatibility
      const sanitizedData = {
        ...handData,
        hero_all_in: handData.hero_all_in ? 1 : 0,
        villain_all_in: handData.villain_all_in ? 1 : 0,
        ev_chips: evChips
      };
      
      this.insertHandStmt.run(sanitizedData);
      return true;
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        // Main déjà importée, ignorer
        return false;
      }
      throw error;
    }
  }

  parseActions(hand) {
    return {
      preflop: hand.preflop_action ? hand.preflop_action.split('\n') : [],
      flop: hand.flop_action ? hand.flop_action.split('\n') : [],
      turn: hand.turn_action ? hand.turn_action.split('\n') : [],
      river: hand.river_action ? hand.river_action.split('\n') : []
    };
  }

  calculatePlayerInvestment(actions, playerName) {
    let totalInvestment = 0;
    const streets = [actions.preflop, actions.flop, actions.turn, actions.river];
    for (const streetActions of streets) {
      let streetInvestment = 0;
      for (const action of streetActions) {
        if (!action.includes(playerName)) continue;
        
        if (action.includes('Posts SB')) {
          const match = action.match(/Posts SB (\d+)/);
          if (match) streetInvestment += parseInt(match[1]);
        } else if (action.includes('Posts BB')) {
          const match = action.match(/Posts BB (\d+)/);
          if (match) streetInvestment += parseInt(match[1]);
        } else if (action.includes('Raises to')) {
          const match = action.match(/Raises to (\d+)/);
          if (match) streetInvestment = parseInt(match[1]);
        } else if (action.includes('Calls')) {
          const match = action.match(/Calls (\d+)/);
          if (match) streetInvestment += parseInt(match[1]);
        } else if (action.includes('Bets')) {
          const match = action.match(/Bets (\d+)/);
          if (match) streetInvestment += parseInt(match[1]);
        }
      }
      totalInvestment += streetInvestment;
    }
    return totalInvestment;
  }

  extractAllPlayerNames(actions) {
    const names = new Set();
    const allLines = [...actions.preflop, ...actions.flop, ...actions.turn, ...actions.river];
    for (const line of allLines) {
        const match = line.match(/- (.*?):/);
        if (match) {
            names.add(match[1]);
        }
    }
    return Array.from(names);
  }

  identifyHeroName(actions, heroPosition) {
    // Try to find name from Posts SB/BB
    const pos = heroPosition.replace('Hero (', '').replace(')', '');
    // BTN doesn't post in 3-way. Handle BTN separately below.
    const regex = new RegExp(`: Posts ${pos} \\d+`);
    
    for (const line of actions.preflop) {
        if (regex.test(line)) {
            const match = line.match(/- (.*?): Posts/);
            if (match) return match[1];
        }
    }
    
    // If not found (e.g. BTN in 3-way or HU), deduce from posters/order
    const players = this.extractAllPlayerNames(actions);
    
    // Find SB and BB
    let sbName = null;
    let bbName = null;
    
    for (const line of actions.preflop) {
        if (line.includes('Posts SB')) {
            const match = line.match(/- (.*?): Posts/);
            if (match) sbName = match[1];
        }
        if (line.includes('Posts BB')) {
            const match = line.match(/- (.*?): Posts/);
            if (match) bbName = match[1];
        }
    }
    
    if (pos === 'SB') return sbName;
    if (pos === 'BB') return bbName;
    
    if (pos === 'BTN') {
      // HU: BTN posts SB
      if (players.length === 2) return sbName;
      // 3-way: BTN is the one who is not SB or BB
      if (players.length === 3) return players.find(p => p !== sbName && p !== bbName);
    }
    
    // Fallback: Return first player? No.
    return null;
  }

  /**
   * Calcule l'EV d'une main (une seule fois lors de l'import)
   * PT4 calcule l'EV pour toutes les mains où les cartes sont connues et hero va au showdown
   */
  calculateHandEV(hand) {
    const profit = hand.hero_profit || 0;
    const isAllIn = (hand.hero_all_in || hand.villain_all_in);
    const hasShowdown = hand.showdown && hand.showdown.trim() !== '';
    const heroCardsInShowdown = hasShowdown && hand.hero_cards && hand.showdown.includes(hand.hero_cards);
    
    // Conditions pour calculer l'EV:
    // 1. Cartes hero et villain connues
    // 2. Hero est allé au showdown (ses cartes sont visibles) OU est all-in
    const shouldCalculateEV = hand.hero_cards && hand.villain_cards && hand.total_pot &&
      (isAllIn || heroCardsInShowdown);
    
    if (!shouldCalculateEV) {
      return profit; // Pas de calcul EV
    }
    
    try {
      // Si Hero a fold (profit < 0) et n'était pas All-In, pas de calcul d'EV
      if (!hand.hero_all_in && profit < 0 && !heroCardsInShowdown) {
        return profit;
      }

      if (!this._equityCalc) {
        const EquityCalculator = require('../analyzer/equityCalculator');
        this._equityCalc = new EquityCalculator();
      }
      const equityCalc = this._equityCalc;
      
      // Déterminer le street du all-in (ou 'unknown' si pas all-in)
      const allinStreet = isAllIn ? this.getAllInStreet(
        hand.preflop_action,
        hand.flop_action,
        hand.turn_action,
        hand.river_action
      ) : 'unknown';
      
      // Board pour le calcul d'équité
      // Si all-in: utiliser le board au moment du all-in
      // Si showdown sans all-in: utiliser le board complet (river)
      let board = '';
      if (allinStreet === 'preflop' || allinStreet === 'unknown') {
        // Pour preflop all-in ou showdown sans all-in, utiliser le board complet
        const boardCards = [];
        if (hand.flop) boardCards.push(...hand.flop.split(' '));
        if (hand.turn) boardCards.push(hand.turn);
        if (hand.river) boardCards.push(hand.river);
        board = boardCards.join(' ');
      } else if (allinStreet === 'flop') {
        board = hand.flop || '';
      } else if (allinStreet === 'turn') {
        const flopCards = hand.flop ? hand.flop.split(' ') : [];
        if (hand.turn) flopCards.push(hand.turn);
        board = flopCards.join(' ');
      } else if (allinStreet === 'river') {
        const boardCards = [];
        if (hand.flop) boardCards.push(...hand.flop.split(' '));
        if (hand.turn) boardCards.push(hand.turn);
        if (hand.river) boardCards.push(hand.river);
        board = boardCards.join(' ');
      }
      
      // Handle multiple villains (separated by '|')
      let villainCards = hand.villain_cards;
      
      // Safety check: If villain cards are missing (e.g. mucked), we cannot calculate EV
      if (!villainCards) {
        return profit;
      }

      if (villainCards.includes('|')) {
        villainCards = villainCards.split('|');
      }

      const equity = equityCalc.calculateEquity(hand.hero_cards, villainCards, board);
      
      // Calculate Investments correctly
      const actions = this.parseActions(hand);
      const heroName = this.identifyHeroName(actions, hand.hero_position);
      
      let heroInvestment = 0;
      let potToWin = 0;
      const netPot = Math.max(0, (hand.total_pot || 0) - (hand.rake || 0));
      
      // Detect if this is a HU or 3-way hand
      const playerNames = this.extractAllPlayerNames(actions);
      const isHU = playerNames.length === 2;

      if (heroName) {
          // 1. Calculate raw investments for all players
          const investments = {};
          let totalCalculatedInvestment = 0;
          let maxInvestment = 0;
          let maxInvestor = null;

          for (const name of playerNames) {
              const inv = this.calculatePlayerInvestment(actions, name);
              investments[name] = inv;
              totalCalculatedInvestment += inv;
              
              if (inv > maxInvestment) {
                  maxInvestment = inv;
                  maxInvestor = name;
              }
          }

          // 2. Adjust for uncalled bets (if Total Inv > Net Pot)
          if (totalCalculatedInvestment > netPot) {
              const excess = totalCalculatedInvestment - netPot;
              if (maxInvestor) {
                  investments[maxInvestor] -= excess;
              }
          }

          // 3. Hero's actual investment
          heroInvestment = investments[heroName] || 0;
          
          // 4. Calculate pot to win - use netPot for all situations
          // PT4 appears to use the full pot, not effective pot
          potToWin = netPot;
      } else {
          // Fallback if name not found
          heroInvestment = profit >= 0 ? (netPot - profit) : Math.abs(profit);
          potToWin = netPot;
      }
      
      // EV = (equity% × potToWin) - heroInvestment
      const evProfit = (equity / 100) * potToWin - heroInvestment;
      
      return evProfit;
    } catch (error) {
      console.error('Error calculating EV:', error);
      return profit;
    }
  }

  recalculateAllEV() {
    console.log('Starting EV Recalculation...');
    const hands = this.db.prepare('SELECT * FROM hands').all();
    let updated = 0;
    
    const updateStmt = this.db.prepare('UPDATE hands SET ev_chips = ? WHERE id = ?');
    
    this.db.transaction(() => {
      for (const hand of hands) {
        const oldEV = hand.ev_chips;
        const newEV = this.calculateHandEV(hand);
        
        if (Math.abs(newEV - oldEV) > 1) {
          // console.log(`Updating Hand ${hand.hand_id}: ${oldEV} -> ${newEV}`);
          updateStmt.run(newEV, hand.id);
          updated++;
        }
      }
    })();
    
    console.log(`EV Recalculation Complete. Updated ${updated} hands.`);
  }

  getDashboardStats() {
    const stats = this.db.prepare(`
      SELECT 
        COUNT(*) as total_hands,
        SUM(hero_profit) as total_profit,
        AVG(hero_profit) as avg_profit,
        SUM(CASE WHEN hero_profit > 0 THEN 1 ELSE 0 END) as hands_won,
        SUM(CASE WHEN hero_profit < 0 THEN 1 ELSE 0 END) as hands_lost
      FROM hands
    `).get();

    const recentHands = this.db.prepare(`
      SELECT 
        date_time,
        hero_profit,
        total_pot,
        hero_position,
        villain_position
      FROM hands
      ORDER BY date_time DESC
      LIMIT 100
    `).all();

    return {
      ...stats,
      recent_hands: recentHands
    };
  }

  getSessionHistory(limit = 50) {
    return this.db.prepare(`
      SELECT 
        date(date_time) as session_date,
        COUNT(*) as hands_played,
        SUM(hero_profit) as profit,
        room,
        game_type
      FROM hands
      GROUP BY date(date_time), room, game_type
      ORDER BY date_time DESC
      LIMIT ?
    `).all(limit);
  }

  getHandById(handId) {
    return this.db.prepare(`
      SELECT * FROM hands WHERE id = ?
    `).get(handId);
  }

  analyzeLeaks(options = {}) {
    // Récupérer les mains avec des actions problématiques
    const leaks = this.db.prepare(`
      SELECT 
        id,
        hero_position,
        hero_cards,
        preflop_action,
        hero_profit,
        total_pot
      FROM hands
      WHERE leak_detected IS NOT NULL
      ORDER BY date_time DESC
      LIMIT 100
    `).all();

    return leaks;
  }

  getRangeHeatmap(filters = {}) {
    // Générer une heatmap 13x13 des ranges jouées
    const hands = this.db.prepare(`
      SELECT hero_cards
      FROM hands
      WHERE hero_cards IS NOT NULL
    `).all();

    const heatmap = this.generateHeatmapMatrix(hands);
    return heatmap;
  }

  generateHeatmapMatrix(hands) {
    // Initialiser matrice 13x13
    const ranks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
    const matrix = {};
    
    ranks.forEach(r1 => {
      ranks.forEach(r2 => {
        const key = r1 >= r2 ? `${r1}${r2}` : `${r2}${r1}`;
        if (!matrix[key]) {
          matrix[key] = { suited: 0, offsuit: 0, pair: 0 };
        }
      });
    });

    hands.forEach(({ hero_cards }) => {
      if (!hero_cards) return;
      
      const cards = hero_cards.replace(/[\[\]]/g, '').split(' ');
      if (cards.length !== 2) return;

      const rank1 = cards[0][0];
      const rank2 = cards[1][0];
      const suit1 = cards[0][1];
      const suit2 = cards[1][1];

      const key = rank1 >= rank2 ? `${rank1}${rank2}` : `${rank2}${rank1}`;
      
      if (rank1 === rank2) {
        matrix[key].pair++;
      } else if (suit1 === suit2) {
        matrix[key].suited++;
      } else {
        matrix[key].offsuit++;
      }
    });

    return matrix;
  }

  /**
   * Supprime toutes les mains de la base de données
   * @returns {Object} { success, deletedCount }
   */
  deleteAllHands() {
    try {
      const countBefore = this.db.prepare('SELECT COUNT(*) as count FROM hands').get();
      
      // Supprimer toutes les mains
      this.db.prepare('DELETE FROM hands').run();
      
      // Supprimer toutes les sessions
      this.db.prepare('DELETE FROM sessions').run();
      
      // Supprimer tous les leaks
      this.db.prepare('DELETE FROM leaks').run();
      
      // Réinitialiser les stats des joueurs
      this.db.prepare(`
        UPDATE players 
        SET total_hands = 0, 
            total_profit = 0, 
            total_ev_profit = 0
      `).run();
      
      return { 
        success: true, 
        deletedCount: countBefore.count,
        message: `${countBefore.count} mains supprimées avec succès`
      };
    } catch (error) {
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * Détecte si une main est en heads-up (2 joueurs) ou 3-way (3 joueurs)
   * En comptant les joueurs uniques dans le preflop_action
   */
  isHeadsUp(preflopAction) {
    if (!preflopAction) return false;
    
    const lines = preflopAction.trim().split('\n');
    const players = new Set();
    
    for (const line of lines) {
      // Username can contain spaces/special chars; capture until the ':' delimiter
      const match = line.match(/^\d{2}:\d{2}:\d{2} - (.*?):/);
      if (match) {
        players.add(match[1].trim());
      }
    }
    
    // HU = exactement 2 joueurs
    return players.size === 2;
  }

  /**
   * Détermine à quel street le all-in s'est produit
   */
  getAllInStreet(preflopAction, flopAction, turnAction, riverAction) {
    if (preflopAction && preflopAction.includes('all-in')) return 'preflop';
    if (flopAction && flopAction.includes('all-in')) return 'flop';
    if (turnAction && turnAction.includes('all-in')) return 'turn';
    if (riverAction && riverAction.includes('all-in')) return 'river';
    return 'unknown';
  }

  getWinrateChartData(options = {}) {
    // Targets from PT4 (used only for console diagnostics)
    const PT4_TARGETS = {
      green: 28500,  // Chips Won
      yellow: 25786, // Net Expected Chips Won
      blue: 25372,   // Chips Won With Showdown
      red: 3128      // Chips Won Without Showdown
    };

    const { dateFrom, dateTo } = options;
    
    // Build WHERE clause for date filtering
    // Database stores UTC dates like "2026-01-02 10:30:42 (UTC)"
    // PT4 uses local time (France = UTC+1 in January)
    // We need to convert UTC to local time for comparison
    let dateWhereClause = '';
    const params = [];
    
    if (dateFrom || dateTo) {
      // Since France is UTC+1 in winter, when user selects 2026-01-02:
      // - PT4 interprets as local midnight 00:00 to 23:59 (local)
      // - In UTC that's 2026-01-01 23:00 to 2026-01-02 22:59
      // So we need to shift UTC dates by -1 hour to get local dates
      // SQLite: datetime(date_time, '+1 hour') converts UTC to local
      
      if (dateFrom && dateTo) {
        // Extract date from "2026-01-02 10:30:42 (UTC)" format, adding 1 hour for local time
        dateWhereClause = `WHERE date(datetime(SUBSTR(date_time, 1, 19), '+1 hour')) >= ? AND date(datetime(SUBSTR(date_time, 1, 19), '+1 hour')) <= ?`;
        params.push(dateFrom, dateTo);
      } else if (dateFrom) {
        dateWhereClause = `WHERE date(datetime(SUBSTR(date_time, 1, 19), '+1 hour')) >= ?`;
        params.push(dateFrom);
      } else if (dateTo) {
        dateWhereClause = `WHERE date(datetime(SUBSTR(date_time, 1, 19), '+1 hour')) <= ?`;
        params.push(dateTo);
      }
    }

    // D'abord compter le nombre total de mains
    const totalHandsResult = this.db.prepare(`SELECT COUNT(*) as count FROM hands ${dateWhereClause}`).get(...params);
    const totalHands = totalHandsResult.count;
    console.log(`Total hands in database (filtered): ${totalHands}, dateFrom=${dateFrom}, dateTo=${dateTo}`);
    
    // OPTIMISATION: Récupérer uniquement les colonnes nécessaires + ev_chips pré-calculé
    const query = `
      SELECT 
        id,
        hand_id,
        hero_profit,
        showdown,
        hero_position,
        hero_cards,
        villain_cards,
        total_pot,
        rake,
        preflop_action,
        flop,
        flop_action,
        turn,
        turn_action,
        river,
        river_action,
        hero_all_in,
        game_id,
        buy_in,
        prize_pool,
        result,
        ev_chips
      FROM hands
      ${dateWhereClause}
      ORDER BY 
        CASE 
          WHEN date_time IS NULL OR date_time = '' THEN 1 
          ELSE 0 
        END,
        date_time ASC,
        rowid ASC
    `;
    const stmt = this.db.prepare(query);

    if (totalHands === 0) {
      return {
        labels: [],
        wonWithoutShowdown: [],
        realWin: [],
        wonWithShowdown: [],
        theoricalWin: [],
        stats: {
          tournaments: 0,
          cevSpinPro: 0,
          cevHuSb: 0,
          cevHuBb: 0,
          cev3wBtn: 0,
          cev3wSb: 0,
          cev3wBb: 0,
          netWon: 0,
          netAdjusted: 0
        }
      };
    }

    const labels = [];
    const wonWithoutShowdown = [];
    const realWin = [];
    const wonWithShowdown = [];
    const theoricalWin = [];

    let cumulativeReal = 0;
    let cumulativeNoSD = 0;
    let cumulativeSD = 0;
    let cumulativeEV = 0;

    // Stats accumulators
    const tournaments = new Set();
    const tournamentResults = {}; // game_id -> { buyIn, prizePool, won, profitChips, evChips, maxPlayers, payouts }
    
    // Position stats accumulators (EV Chips)
    const posStats = {
      huSb: { ev: 0, count: 0 },
      huBb: { ev: 0, count: 0 },
      w3Btn: { ev: 0, count: 0 },
      w3Sb: { ev: 0, count: 0 },
      w3Bb: { ev: 0, count: 0 }
    };

    // Downsampling configuration
    const MAX_POINTS = 2000;
    const step = Math.max(1, Math.floor(totalHands / MAX_POINTS));
    let processedCount = 0;

    for (const hand of stmt.iterate(...params)) {
      const profit = hand.hero_profit || 0;
      
      // Real Win (cumulative total)
      cumulativeReal += profit;

        // PT4 definition of showdown FROM HERO'S PERSPECTIVE:
        // - If hero folded, it's NOT a showdown for hero (even if others showed)
        // - If hero's cards are shown in the showdown section, it's a showdown
        // - If hero went all-in and got called (no fold, all-in before flop), it's showdown
        const hasShowdownText = !!(hand.showdown && hand.showdown.trim() !== '');
        
        // Check if hero's cards appear in the showdown text
        // This indicates hero actually participated in the showdown
        const heroCardsInShowdown = hasShowdownText && hand.hero_cards && 
          hand.showdown.includes(hand.hero_cards);

        const hasFoldAnywhere = !!(
        (hand.preflop_action && /Folds/i.test(hand.preflop_action)) ||
        (hand.flop_action && /Folds/i.test(hand.flop_action)) ||
        (hand.turn_action && /Folds/i.test(hand.turn_action)) ||
        (hand.river_action && /Folds/i.test(hand.river_action))
        );

        // Preflop all-in with NO fold = showdown (cards were virtually shown even without flop)
        // Key: only if no one folded! If someone folds to all-in, it's NOT a showdown.
        const isPreflopAllInNoFold = !hasFoldAnywhere && !hand.flop && 
          hand.preflop_action && /all-in/i.test(hand.preflop_action);
        
        const reachedRiverNoFold = !hasFoldAnywhere && hand.river && String(hand.river).trim() !== '';

        // Showdown for hero:
        // 1. Hero's cards shown in showdown text (hero didn't fold, explicit showdown)
        // 2. OR all-in preflop with no fold (everyone called)
        // 3. OR reached river with no fold anywhere
        const isShowdown = heroCardsInShowdown || isPreflopAllInNoFold || reachedRiverNoFold;
            
        if (processedCount < 10) {
        console.log(`Hand ${hand.hand_id}: isShowdown=${isShowdown}, hasShowdownText=${hasShowdownText}, hasFoldAnywhere=${hasFoldAnywhere}, profit=${profit}`);
        }
            
      // Won without showdown
      if (!isShowdown) {
        cumulativeNoSD += profit;
      }

      // Won with showdown
      if (isShowdown) {
        cumulativeSD += profit;
      }

      // PT4-style EV: Only apply EV adjustments for HERO all-in hands
      // When hero is all-in, use the calculated ev_chips
      // When only villain is all-in (hero not all-in), use actual profit
      const evProfit = (hand.hero_all_in && hand.ev_chips !== null && hand.ev_chips !== undefined)
        ? hand.ev_chips 
        : profit;
      
      cumulativeEV += evProfit;

      // Only push data points according to step to avoid sending millions of points
      if (processedCount % step === 0 || processedCount === totalHands - 1) {
        labels.push(processedCount + 1);
        realWin.push(cumulativeReal);
        wonWithoutShowdown.push(cumulativeNoSD);
        wonWithShowdown.push(cumulativeSD);
        theoricalWin.push(cumulativeEV);
      }

      // Position detection with HU support
      const isHU = this.isHeadsUp(hand.preflop_action);
      let positionType = null;
      const isBtn = hand.hero_position && hand.hero_position.includes('BTN');
      const isSb = hand.hero_position && hand.hero_position.includes('SB');
      const isBb = hand.hero_position && hand.hero_position.includes('BB');
      
      if (isHU) {
        // In HU: BTN is also SB
        if (isBtn || isSb) {
          positionType = 'huSb';
        } else if (isBb) {
          positionType = 'huBb';
        }
      } else {
        // 3-way
        if (isBtn && !isSb) {
          positionType = 'w3Btn';
        } else if (isSb && !isBtn) {
          positionType = 'w3Sb';
        } else if (isBb) {
          positionType = 'w3Bb';
        }
      }
      
      if (positionType) {
        posStats[positionType].ev += evProfit;
        posStats[positionType].count++;
      }

      // --- Stats Calculation ---
      
      if (hand.game_id) {
        tournaments.add(hand.game_id);
        if (!tournamentResults[hand.game_id]) {
          tournamentResults[hand.game_id] = { 
            buyIn: hand.buy_in || 0, 
            prizePool: hand.prize_pool || 0, 
            won: 0,
            profitChips: 0,
            evChips: 0,
            maxPlayers: 2, // Assume at least 2
            payouts: {} // place -> amount
          };
        }
        
        // Realized chips per tournament
        tournamentResults[hand.game_id].profitChips += profit;
        tournamentResults[hand.game_id].evChips += evProfit;
        
        // Update max players if we see 3-way action
        if (!isHU) {
          tournamentResults[hand.game_id].maxPlayers = 3;
        }

        // Parse tournament payouts from SUMMARY.
        // Betclic can pay 2nd place in big multipliers (e.g. x100), so don't assume winner-takes-all.
        if (hand.result && hand.result.includes('wins')) {
          const actionsForName = this.parseActions(hand);
          const heroName = this.identifyHeroName(actionsForName, hand.hero_position);

          const payoutRegex = /^(.+?) finished (\d+)(st|nd|rd) and wins ([\d.]+) EUR$/gm;
          let match;
          while ((match = payoutRegex.exec(hand.result)) !== null) {
            const player = match[1].trim();
            const place = parseInt(match[2], 10);
            const amount = parseFloat(match[4]);

            if (!Number.isNaN(place) && !Number.isNaN(amount)) {
              // Record payout per place (keep the max seen)
              const prev = tournamentResults[hand.game_id].payouts[place] || 0;
              tournamentResults[hand.game_id].payouts[place] = Math.max(prev, amount);

              // Record Hero's actual won amount if this line is Hero (or the reconstructed heroName)
              if (player === 'Hero' || (heroName && player === heroName)) {
                tournamentResults[hand.game_id].won = Math.max(tournamentResults[hand.game_id].won, amount);
              }
            }
          }
        }
      }
      
      processedCount++;
    }

    // Calculate final stats
    let totalNetWon = 0;
    let totalNetAdjusted = 0;
    let totalBuyIns = 0;

    // PT4-style Net Adjusted (empirically matches):
    // NetAdjusted = NetWon + sum_over_tourneys( (EV_chips - Real_chips) * chipValueIn€ )
    // chipValueIn€ uses the tournament's actual total payouts when available, falling back to prizePool.
    const TOTAL_CHIPS_PER_TOURNAMENT = 1500;

    Object.values(tournamentResults).forEach(t => {
      totalBuyIns += t.buyIn;

      const payoutValues = Object.values(t.payouts || {});
      const totalPayout = payoutValues.length > 0
        ? payoutValues.reduce((sum, v) => sum + (v || 0), 0)
        : (t.prizePool || 0);

      totalNetWon += t.won;

      const chipDelta = (t.evChips || 0) - (t.profitChips || 0);
      const chipValue = totalPayout / TOTAL_CHIPS_PER_TOURNAMENT;

      // Build adjusted winnings before subtracting buy-ins globally
      totalNetAdjusted += t.won + chipDelta * chipValue;
    });

    // Soustraire les buy-ins du total
    totalNetWon -= totalBuyIns;
    totalNetAdjusted -= totalBuyIns;

    // PT4: all CEV values here are per tournament: amt_expected_won_* / cnt_tourneys
    const stats = {
      tournaments: tournaments.size,
      // CEV SpinPro = amt_expected_won / cnt_tourneys
      cevSpinPro: tournaments.size > 0 ? Math.round(cumulativeEV / tournaments.size) : 0,
      // CEV positions = amt_expected_won_position / cnt_tourneys
      cevHuSb: tournaments.size > 0 ? Math.round(posStats.huSb.ev / tournaments.size) : 0,
      cevHuBb: tournaments.size > 0 ? Math.round(posStats.huBb.ev / tournaments.size) : 0,
      cev3wBtn: tournaments.size > 0 ? Math.round(posStats.w3Btn.ev / tournaments.size) : 0,
      cev3wSb: tournaments.size > 0 ? Math.round(posStats.w3Sb.ev / tournaments.size) : 0,
      cev3wBb: tournaments.size > 0 ? Math.round(posStats.w3Bb.ev / tournaments.size) : 0,
      netWon: totalNetWon,
      netAdjusted: totalNetAdjusted
    };
    
    console.log('Stats calculated:', stats);

    // --- DIAGNOSTICS FOR PT4 COMPARISON ---
    console.log('--- PT4 COMPARISON DIAGNOSTICS ---');
    console.log(`Green (Real Won): ${Math.round(cumulativeReal)} (Target: ${PT4_TARGETS.green})`);
    console.log(`Yellow (EV):      ${Math.round(cumulativeEV)} (Target: ${PT4_TARGETS.yellow})`);
    console.log(`Blue (Showdown):  ${Math.round(cumulativeSD)} (Target: ${PT4_TARGETS.blue})`);
    console.log(`Red (No Showdown):${Math.round(cumulativeNoSD)} (Target: ${PT4_TARGETS.red})`);
    
    // EV debug: count hands with different EV
    const evDebug = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN ev_chips IS NOT NULL AND ev_chips != hero_profit THEN 1 ELSE 0 END) as withEVCalc,
        SUM(CASE WHEN villain_cards IS NULL OR villain_cards = '' THEN 1 ELSE 0 END) as noVillainCards,
        SUM(CASE WHEN hero_all_in = 1 OR villain_all_in = 1 THEN 1 ELSE 0 END) as allInHands,
        SUM(CASE WHEN (hero_all_in = 1 OR villain_all_in = 1) AND (villain_cards IS NULL OR villain_cards = '') THEN 1 ELSE 0 END) as allInNoVillain,
        SUM(CASE WHEN showdown IS NOT NULL AND showdown != '' THEN 1 ELSE 0 END) as withShowdown
      FROM hands
    `).get();
    console.log('EV Debug:', evDebug);
    
    // Check detailed stats on all-in hands WITH villain cards (where EV should differ)
    const allInWithVillainStmt = this.db.prepare(`
      SELECT 
        SUM(hero_profit) as totalProfit,
        SUM(ev_chips) as totalEV,
        SUM(hero_profit) - SUM(ev_chips) as luckedOut,
        COUNT(*) as count
      FROM hands
      WHERE (hero_all_in = 1 OR villain_all_in = 1) 
        AND villain_cards IS NOT NULL AND villain_cards != ''
        AND ev_chips IS NOT NULL
    `);
    console.log('All-in WITH villain cards stats:', allInWithVillainStmt.get());
    
    // Check if there are any hands that should have EV calc but don't
    const shouldHaveEV = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM hands
      WHERE (hero_all_in = 1 OR villain_all_in = 1) 
        AND villain_cards IS NOT NULL AND villain_cards != ''
        AND (ev_chips IS NULL OR ev_chips = hero_profit)
    `);
    console.log('Hands that should have EV but profit=EV:', shouldHaveEV.get());
    
    // Sample why some hands don't have EV calculated
    const sampleNoEV = this.db.prepare(`
      SELECT hand_id, hero_profit, ev_chips, hero_cards, villain_cards, total_pot, 
             hero_all_in, villain_all_in, showdown, flop
      FROM hands
      WHERE (hero_all_in = 1 OR villain_all_in = 1) 
        AND villain_cards IS NOT NULL AND villain_cards != ''
        AND (ev_chips IS NULL OR ev_chips = hero_profit)
      LIMIT 5
    `);
    console.log('Sample hands with villain cards but no EV calc:');
    for (const row of sampleNoEV.iterate()) {
      console.log({
        hand_id: row.hand_id,
        profit: row.hero_profit,
        ev: row.ev_chips,
        hero_cards: row.hero_cards,
        villain_cards: row.villain_cards,
        pot: row.total_pot,
        hero_allin: row.hero_all_in,
        villain_allin: row.villain_all_in,
        hasShowdown: row.showdown ? 'yes' : 'no',
        hasFlop: row.flop ? 'yes' : 'no'
      });
    }
    
    // Check showdown hands that are NOT all-in
    const showdownNotAllin = this.db.prepare(`
      SELECT 
        COUNT(*) as count,
        SUM(hero_profit) as totalProfit
      FROM hands
      WHERE showdown IS NOT NULL AND showdown != ''
        AND hero_all_in = 0 AND villain_all_in = 0
        AND villain_cards IS NOT NULL AND villain_cards != ''
    `);
    console.log('Showdown hands NOT all-in (with villain cards):', showdownNotAllin.get());
    
    // Position debug
    console.log('Position Stats:', {
      huSb: posStats.huSb,
      huBb: posStats.huBb,
      w3Btn: posStats.w3Btn,
      w3Sb: posStats.w3Sb,
      w3Bb: posStats.w3Bb
    });
    console.log('Total EV sum:', posStats.huSb.ev + posStats.huBb.ev + posStats.w3Btn.ev + posStats.w3Sb.ev + posStats.w3Bb.ev);
    
    return {
      labels,
      wonWithoutShowdown,
      realWin,
      wonWithShowdown,
      theoricalWin,
      stats
    };
  }

  extractPlayersFromPreflop(preflopAction) {
    if (!preflopAction) return [];
    const lines = String(preflopAction).trim().split('\n');
    const players = new Set();

    for (const line of lines) {
      const match = line.match(/^\d{2}:\d{2}:\d{2} - (.*?):/);
      if (match && match[1]) {
        players.add(match[1].trim());
      }
    }

    return Array.from(players);
  }

  getPlayersOverview(options = {}) {
    const limit = Number.isFinite(options.limit) ? Math.max(1, options.limit) : 200;

    const stmt = this.db.prepare(`
      SELECT preflop_action, date_time, hero_profit
      FROM hands
      WHERE preflop_action IS NOT NULL AND preflop_action != ''
    `);

    // Pass 1: find hero name as the most frequent player in preflop actions
    const counts = new Map();
    for (const row of stmt.iterate()) {
      const names = this.extractPlayersFromPreflop(row.preflop_action);
      for (const name of names) {
        counts.set(name, (counts.get(name) || 0) + 1);
      }
    }

    let heroName = null;
    let heroCount = 0;
    for (const [name, count] of counts.entries()) {
      if (count > heroCount) {
        heroName = name;
        heroCount = count;
      }
    }

    if (!heroName) {
      return { heroName: null, players: [] };
    }

    // Pass 2: aggregate opponents
    const playersMap = new Map();
    const upsert = (name) => {
      if (!playersMap.has(name)) {
        playersMap.set(name, {
          name,
          handsSeen: 0,
          handsHu: 0,
          profitHu: 0,
          lastSeen: null
        });
      }
      return playersMap.get(name);
    };

    const normalizeDate = (value) => {
      if (!value) return null;
      const s = String(value).trim();
      const ts = Date.parse(s);
      if (!Number.isNaN(ts)) return { raw: s, ts };
      return { raw: s, ts: null };
    };

    const stmt2 = this.db.prepare(`
      SELECT preflop_action, date_time, hero_profit
      FROM hands
      WHERE preflop_action IS NOT NULL AND preflop_action != ''
      ORDER BY date_time DESC
    `);

    for (const row of stmt2.iterate()) {
      const names = this.extractPlayersFromPreflop(row.preflop_action);
      if (names.length === 0) continue;

      const date = normalizeDate(row.date_time);

      // Update "seen" stats for all non-hero players present
      for (const name of names) {
        if (name === heroName) continue;
        const p = upsert(name);
        p.handsSeen += 1;

        if (date) {
          if (!p.lastSeen) {
            p.lastSeen = date;
          } else if (p.lastSeen.ts !== null && date.ts !== null) {
            if (date.ts > p.lastSeen.ts) p.lastSeen = date;
          } else if (p.lastSeen.ts === null && date.ts !== null) {
            p.lastSeen = date;
          }
        }
      }

      // HU profit attribution: only when exactly 2 players and hero is detected
      const isHu = this.isHeadsUp(row.preflop_action);
      if (!isHu) continue;
      if (!names.includes(heroName)) continue;

      const opponentName = names.find(n => n !== heroName);
      if (!opponentName) continue;

      const p = upsert(opponentName);
      p.handsHu += 1;
      p.profitHu += Number(row.hero_profit || 0);
    }

    const players = Array.from(playersMap.values())
      .sort((a, b) => {
        if (b.handsSeen !== a.handsSeen) return b.handsSeen - a.handsSeen;
        return b.handsHu - a.handsHu;
      })
      .slice(0, limit)
      .map(p => ({
        name: p.name,
        handsSeen: p.handsSeen,
        handsHu: p.handsHu,
        profitHu: p.profitHu,
        lastSeen: p.lastSeen?.raw || null
      }));

    return {
      heroName,
      players
    };
  }

  close() {
    this.db.close();
  }
}

module.exports = PokerDatabase;
