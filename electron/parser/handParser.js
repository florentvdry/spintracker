class HandParser {
  constructor() {
    this.handSeparator = '------------';
    // Version du parser - incrémenter à chaque modification du calcul de profit
    this.PARSER_VERSION = 3; // v3: Extract villain cards from showdown section
  }

  parseFile(fileContent) {
    try {
      const handTexts = fileContent.split(this.handSeparator).filter(h => h.trim());
      const hands = [];

      for (const handText of handTexts) {
        const hand = this.parseHand(handText);
        if (hand) {
          hands.push(hand);
        }
      }

      return {
        success: true,
        hands: hands,
        count: hands.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  parseHand(handText) {
    try {
      const lines = handText.split('\n').map(l => l.trim()).filter(l => l);
      
      const hand = {
        id: null,
        game_id: null,
        hand_id: null,
        room: null,
        game_mode: null,
        game_type: null,
        game_name: null,
        prize_pool: 0,
        multiplier: 1,
        buy_in: 0,
        date_time: null,
        table_id: null,
        blinds: null,
        total_pot: 0,
        rake: 0,
        hero_position: null,
        hero_stack: 0,
        hero_cards: null,
        villain_position: null,
        villain_stack: 0,
        villain_cards: null,
        preflop_action: '',
        flop: null,
        flop_action: '',
        turn: null,
        turn_action: '',
        river: null,
        river_action: '',
        showdown: '',
        result: '',
        hero_profit: 0,
        hero_all_in: false,
        villain_all_in: false
      };

      let currentSection = 'HEADER';
      let heroName = null;
      let players = [];
      let heroWon = false; // Flag pour savoir si hero a gagné
      let totalPotWon = 0; // Total de tous les pots gagnés (main pot + side pots)
      let actions = {
        preflop: [],
        flop: [],
        turn: [],
        river: []
      };

      for (const line of lines) {
        // Détection des sections
        if (line.includes('*** HEADER ***')) {
          currentSection = 'HEADER';
        } else if (line.includes('*** PLAYERS ***')) {
          currentSection = 'PLAYERS';
        } else if (line.includes('*** HOLE CARDS ***')) {
          currentSection = 'HOLE_CARDS';
        } else if (line.includes('*** PRE-FLOP ***')) {
          currentSection = 'PREFLOP';
        } else if (line.includes('*** FLOP ***')) {
          currentSection = 'FLOP';
          const match = line.match(/\[(.*?)\]/);
          if (match) hand.flop = match[1];
        } else if (line.includes('*** TURN ***')) {
          currentSection = 'TURN';
          const match = line.match(/\[(.*?)\]/);
          if (match) {
            const cards = match[1].split(' ');
            hand.turn = cards[cards.length - 1];
          }
        } else if (line.includes('*** RIVER ***')) {
          currentSection = 'RIVER';
          const match = line.match(/\[(.*?)\]/);
          if (match) {
            const cards = match[1].split(' ');
            hand.river = cards[cards.length - 1];
          }
        } else if (line.includes('*** SHOWDOWN ***')) {
          currentSection = 'SHOWDOWN';
        } else if (line.includes('*** SUMMARY ***')) {
          currentSection = 'SUMMARY';
        }

        // Parsing HEADER
        if (currentSection === 'HEADER') {
          if (line.startsWith('Site:')) {
            hand.room = line.split(':')[1].trim();
          } else if (line.startsWith('Game Mode:')) {
            hand.game_mode = line.split(':')[1].trim();
          } else if (line.startsWith('Game Type:')) {
            hand.game_type = line.split(':')[1].trim();
          } else if (line.startsWith('Game Name:')) {
            hand.game_name = line.split(':')[1].trim();
          } else if (line.startsWith('Game ID:')) {
            hand.game_id = line.split(':')[1].trim();
          } else if (line.startsWith('Hand ID:')) {
            hand.hand_id = line.split(':')[1].trim();
            hand.id = hand.hand_id;
          } else if (line.startsWith('Prize pool:')) {
            hand.prize_pool = parseFloat(line.match(/[\d.]+/)[0]);
          } else if (line.startsWith('Multiplier:')) {
            hand.multiplier = parseInt(line.match(/x(\d+)/)[1]);
          } else if (line.startsWith('Buy In:')) {
            hand.buy_in = parseFloat(line.match(/[\d.]+/)[0]);
          } else if (line.startsWith('Date & Time:')) {
            hand.date_time = line.split(':').slice(1).join(':').trim();
          } else if (line.startsWith('Table ID:')) {
            hand.table_id = line.split(':')[1].trim();
          } else if (line.startsWith('Blinds:')) {
            hand.blinds = line.split(':')[1].trim();
          } else if (line.startsWith('Total Pot:')) {
            hand.total_pot = parseFloat(line.match(/[\d.]+/)[0]);
          } else if (line.startsWith('Rake:')) {
            hand.rake = parseFloat(line.match(/[\d.]+/)[0]);
          }
        }

        // Parsing PLAYERS
        if (currentSection === 'PLAYERS') {
          // Improved regex to handle usernames with spaces and special characters
          const seatMatch = line.match(/Seat (\d+): (.+?) \((\d+)\)(.*)/);
          if (seatMatch) {
            const [, seat, name, stack, positions] = seatMatch;
            const isHero = positions.includes('Hero');
            
            const player = {
              seat: parseInt(seat),
              name: name,
              stack: parseInt(stack),
              position: this.extractPosition(positions),
              isHero: isHero
            };

            players.push(player);

            if (isHero) {
              heroName = name;
              hand.hero_stack = parseInt(stack);
              hand.hero_position = player.position;
            }
          }
        }

        // Parsing HOLE CARDS
        if (currentSection === 'HOLE_CARDS') {
          const cardMatch = line.match(/(.+?): \[(.*?)\]/);
          if (cardMatch) {
            const [, playerName, cards] = cardMatch;
            if (playerName === heroName) {
              hand.hero_cards = cards;
            } else {
              // Store multiple villain cards separated by '|'
              if (hand.villain_cards) {
                hand.villain_cards += '|' + cards;
              } else {
                hand.villain_cards = cards;
              }
            }
          }
        }

        // Parsing actions
        if (currentSection === 'PREFLOP' && line.match(/^\d{2}:\d{2}:\d{2}/)) {
          actions.preflop.push(line);
          // Détection all-in
          if (line.includes('and is all-in')) {
            if (line.includes(heroName)) {
              hand.hero_all_in = true;
            } else {
              hand.villain_all_in = true;
            }
          }
        } else if (currentSection === 'FLOP' && line.match(/^\d{2}:\d{2}:\d{2}/)) {
          actions.flop.push(line);
          // Détection all-in
          if (line.includes('and is all-in')) {
            if (line.includes(heroName)) {
              hand.hero_all_in = true;
            } else {
              hand.villain_all_in = true;
            }
          }
        } else if (currentSection === 'TURN' && line.match(/^\d{2}:\d{2}:\d{2}/)) {
          actions.turn.push(line);
          // Détection all-in
          if (line.includes('and is all-in')) {
            if (line.includes(heroName)) {
              hand.hero_all_in = true;
            } else {
              hand.villain_all_in = true;
            }
          }
        } else if (currentSection === 'RIVER' && line.match(/^\d{2}:\d{2}:\d{2}/)) {
          actions.river.push(line);
          // Détection all-in
          if (line.includes('and is all-in')) {
            if (line.includes(heroName)) {
              hand.hero_all_in = true;
            } else {
              hand.villain_all_in = true;
            }
          }
        }

        // Parsing SHOWDOWN
        if (currentSection === 'SHOWDOWN') {
          hand.showdown += line + '\n';
          
          // Extract villain cards from showdown if not already known
          // Format: "PlayerName shows [Xx Xx] (Hand Type)"
          const showsMatch = line.match(/^(.+?) shows \[(.+?)\]/);
          if (showsMatch) {
            const [, playerName, cards] = showsMatch;
            // Only add villain cards, not hero cards
            if (playerName !== heroName && cards) {
              if (!hand.villain_cards) {
                hand.villain_cards = cards;
              } else if (!hand.villain_cards.includes(cards)) {
                // Avoid duplicates, add as additional villain
                hand.villain_cards += '|' + cards;
              }
            }
          }
        }

        // Parsing SUMMARY
        if (currentSection === 'SUMMARY') {
          // Détecter si le hero a gagné un pot (main pot ou side pot)
          if (line.includes('wins') && line.includes(heroName) && line.includes('pot')) {
            const winMatch = line.match(/wins .*?pot of (\d+)/);
            if (winMatch) {
              const potWon = parseInt(winMatch[1]);
              // Accumuler tous les pots gagnés
              totalPotWon += potWon;
              heroWon = true;
            }
          }

          // Handle uncalled bet returned to Hero
          if (line.includes('Uncalled bet') && line.includes('returned to') && line.includes(heroName)) {
             const returnMatch = line.match(/\((\d+)\)/);
             if (returnMatch) {
               // This amount is returned to hero, effectively reducing investment
               // But usually "wins pot" includes the uncalled bet if it was part of the pot?
               // In Betclic, uncalled bet seems to be included in "wins pot" if the pot was won.
               // But if everyone folds to a raise, the uncalled part is returned.
               // We should check if this line appears.
             }
          }
          
          // Remplacer le nom du hero par 'Hero' pour faciliter l'analyse ultérieure
          if (heroName) {
            hand.result += line.replace(heroName, 'Hero') + '\n';
          } else {
            hand.result += line + '\n';
          }
        }
      }

      // Après avoir parcouru toutes les lignes, calculer le profit final
      const numPlayers = players.length;
      
      // Calculate investment for ALL players to detect uncalled bets
      const playerInvestments = {};
      let totalCalculatedInvestment = 0;
      let maxInvestment = 0;
      let maxInvestor = null;

      for (const player of players) {
        const inv = this.calculatePlayerInvestment(actions, player.name);
        playerInvestments[player.name] = inv;
        totalCalculatedInvestment += inv;
        
        if (inv > maxInvestment) {
          maxInvestment = inv;
          maxInvestor = player.name;
        }
      }

      // Check for uncalled bet returned (implicit in Betclic format)
      // If calculated investment > total pot, the difference is the uncalled bet returned to the max investor
      if (totalCalculatedInvestment > hand.total_pot) {
        const excess = totalCalculatedInvestment - hand.total_pot;
        if (maxInvestor) {
          playerInvestments[maxInvestor] -= excess;
        }
      }

      let heroInvestment = playerInvestments[heroName] || 0;
      
      // Validation basique: l'investissement ne peut pas dépasser le pot total
      if (heroInvestment > hand.total_pot) {
        heroInvestment = hand.total_pot;
      }
      
      if (heroWon || totalPotWon > 0) {
        // Hero a gagné tout ou partie du pot
        hand.hero_profit = totalPotWon - heroInvestment;
      } else if (hand.total_pot > 0) {
        // Hero a perdu cette main
        hand.hero_profit = -heroInvestment;
      }

      // Normaliser les positions
      this.normalizePositions(hand, players, heroName);

      // Convertir les actions en string
      hand.preflop_action = actions.preflop.join('\n');
      hand.flop_action = actions.flop.join('\n');
      hand.turn_action = actions.turn.join('\n');
      hand.river_action = actions.river.join('\n');

      return hand;
    } catch (error) {
      console.error('Error parsing hand:', error);
      return null;
    }
  }

  extractPosition(positionString) {
    if (positionString.includes('BTN')) return 'BTN';
    if (positionString.includes('SB')) return 'SB';
    if (positionString.includes('BB')) return 'BB';
    if (positionString.includes('CO')) return 'CO';
    if (positionString.includes('MP')) return 'MP';
    if (positionString.includes('UTG')) return 'UTG';
    return 'Unknown';
  }

  calculatePlayerInvestment(actions, playerName) {
    let totalInvestment = 0;
    
    const streets = [actions.preflop, actions.flop, actions.turn, actions.river];
    
    for (const streetActions of streets) {
      let streetInvestment = 0;
      
      for (const action of streetActions) {
        if (!action.includes(playerName)) continue;
        
        // Posts SB/BB (Only in preflop usually, but handled here)
        if (action.includes('Posts SB')) {
          const match = action.match(/Posts SB (\d+)/);
          if (match) streetInvestment += parseInt(match[1]);
        } else if (action.includes('Posts BB')) {
          const match = action.match(/Posts BB (\d+)/);
          if (match) streetInvestment += parseInt(match[1]);
        }
        // Raises to X
        else if (action.includes('Raises to')) {
          const match = action.match(/Raises to (\d+)/);
          if (match) {
            // "Raises to X" means the player's total wager for this street becomes X
            streetInvestment = parseInt(match[1]);
          }
        }
        // Calls X
        else if (action.includes('Calls')) {
          const match = action.match(/Calls (\d+)/);
          if (match) streetInvestment += parseInt(match[1]);
        }
        // Bets X
        else if (action.includes('Bets')) {
          const match = action.match(/Bets (\d+)/);
          if (match) streetInvestment += parseInt(match[1]);
        }
      }
      
      totalInvestment += streetInvestment;
    }

    return totalInvestment;
  }

  calculateHeroInvestment(actions, heroName) {
    return this.calculatePlayerInvestment(actions, heroName);
  }

  normalizePositions(hand, players, heroName) {
    // Trouver le villain (joueur non-hero)
    const villain = players.find(p => p.name !== heroName);
    
    if (villain) {
      hand.villain_position = villain.position;
      hand.villain_stack = villain.stack;
      
      // Normaliser en format "Hero vs Position"
      hand.hero_position = `Hero (${hand.hero_position})`;
      hand.villain_position = `Villain (${villain.position})`;
    }
  }
}

module.exports = HandParser;
