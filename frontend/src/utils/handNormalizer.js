/**
 * Normalizes various hand formats into a unified internal Hand Model for the Replayer.
 */
export function normalizeHand(input) {
  try {
    if (!input) {
      console.warn('[HandNormalizer] Input is null or undefined');
      return null;
    }

    // If it's already in our internal format
    if (input.isNormalized) {
      return input;
    }

    // Parse Blinds
    let blinds = { sb: 0, bb: 0, ante: 0 };
    if (typeof input.blinds === 'string') {
      // "100/200" or "100/200/20"
      const parts = input.blinds.split('/');
      if (parts.length >= 2) {
        blinds.sb = parseFloat(parts[0]) || 0;
        blinds.bb = parseFloat(parts[1]) || 0;
        if (parts.length > 2) blinds.ante = parseFloat(parts[2]) || 0;
      }
    } else if (input.blinds) {
      blinds = {
        sb: input.blinds.sb || 0,
        bb: input.blinds.bb || 0,
        ante: input.blinds.ante || 0
      };
    }

    // Parse Board
    let board = [];
    if (Array.isArray(input.board)) {
      board = input.board;
    } else if (typeof input.board === 'string') {
      board = parseCards(input.board);
    } else {
      // Try to construct from street strings
      const flop = parseCards(input.flop || input.Flop);
      const turn = parseCards(input.turn || input.Turn);
      const river = parseCards(input.river || input.River);
      board = [...flop, ...turn, ...river];
    }

    // Players
    let players = [];
    const rawPlayers = input.Players || input.players;
    
    if (rawPlayers && Array.isArray(rawPlayers)) {
      players = rawPlayers.map((p, idx) => ({
        seat: p.seat || p.Seat || (idx + 1),
        name: p.name || p.Name || `Player ${idx + 1}`,
        stack: p.stack || p.Stack || 0,
        cards: p.cards || p.Cards || null,
        isHero: p.isHero || p.IsHero || false,
        position: p.position || p.Position || ''
      }));
    }

    if (players.length === 0) {
      console.warn('[HandNormalizer] No players found in hand data');
    }

    // Sort players so hero is first
    players.sort((a, b) => (b.isHero ? 1 : 0) - (a.isHero ? 1 : 0));

    // Actions
    const actions = [];
    
    const parseActionBlock = (text, street) => {
      if (!text || typeof text !== 'string') return;
      const lines = text.split('\n');
      lines.forEach(line => {
        line = line.trim();
        if (!line) return;
        
        try {
          const action = parseActionLine(line, players);
          if (action) {
            actions.push({ ...action, street });
          }
        } catch (e) {
          console.error('[HandNormalizer] Error parsing action line:', line, e);
        }
      });
    };

    parseActionBlock(input.preflop_action || input.PreflopAction, 0);
    parseActionBlock(input.flop_action || input.FlopAction, 1);
    parseActionBlock(input.turn_action || input.TurnAction, 2);
    parseActionBlock(input.river_action || input.RiverAction, 3);
    
    let summaryText = input.showdown || input.Showdown;
    if (!summaryText && (input.result || input.Result)) {
      const fullResult = input.result || input.Result;
      if (typeof fullResult === 'string') {
        if (fullResult.includes('*** HEADER ***') || fullResult.includes('Site:')) {
           const showdownIdx = fullResult.indexOf('*** SHOWDOWN ***');
           const summaryIdx = fullResult.indexOf('*** SUMMARY ***');
           
           if (showdownIdx !== -1) summaryText = fullResult.substring(showdownIdx);
           else if (summaryIdx !== -1) summaryText = fullResult.substring(summaryIdx);
           else if (!fullResult.includes('*** PRE-FLOP ***')) summaryText = fullResult;
        } else {
           summaryText = fullResult;
        }
      }
    }
    
    parseActionBlock(summaryText, 4);

    const btnPlayer = players.find(p => p.position === 'BTN');
    const buttonSeat = btnPlayer ? btnPlayer.seat : (input.buttonSeat || input.ButtonSeat || 0);

    const timelineActions = [];
    players.forEach(p => { p.initialBet = 0; });

    actions.forEach(action => {
        if (action.type === 'post') {
            const p = players.find(pl => pl.name === action.player);
            if (p) {
                p.initialBet += action.amount;
                p.stack -= action.amount;
            }
        } else {
            timelineActions.push(action);
        }
    });

    const normalized = {
      id: input.HandId || input.id || input.id_hand || Date.now().toString(),
      site: input.Site || input.room || 'Unknown',
      tableSize: input.TableSize || input.tableSize || players.length || 6,
      blinds,
      heroName: input.HeroName || input.heroName || players.find(p => p.isHero)?.name || null,
      heroSeat: players.findIndex(p => p.isHero) + 1, 
      buttonSeat,
      timestamp: input.Date || input.timestamp || input.date_time || new Date().toISOString(),
      players,
      board,
      actions: timelineActions,
      isNormalized: true,
    };

    return normalized;
  } catch (error) {
    console.error('[HandNormalizer] Critical error during normalization:', error);
    return null;
  }
}

export function parseCards(str) {
  if (!str || typeof str !== 'string') return [];
  str = str.replace(/\s+/g, '');
  const cards = [];
  for (let i = 0; i < str.length; i += 2) {
    const card = str.substring(i, i + 2);
    if (card.length === 2) cards.push(card);
  }
  return cards;
}

function parseActionLine(line, players) {
  if (!line || !players) return null;
  
  let cleanLine = line.replace(/^\d{1,2}:\d{2}:\d{2}\s*-\s*/, '').trim();
  const sortedPlayers = [...players].sort((a, b) => (b.name?.length || 0) - (a.name?.length || 0));

  let playerName = null;
  let actionText = "";

  for (const p of sortedPlayers) {
      if (!p.name) continue;
      if (cleanLine.startsWith(p.name)) {
          playerName = p.name;
          actionText = cleanLine.substring(p.name.length);
          
          if (actionText.startsWith(':')) {
              actionText = actionText.substring(1).trim();
          } else if (actionText.startsWith(' ')) {
              actionText = actionText.trim();
          } else if (actionText !== "") {
             playerName = null;
             continue;
          }
          break;
      }
  }

  if (!playerName && cleanLine.includes(': ')) {
      const parts = cleanLine.split(': ');
      const potentialName = parts[0].trim();
      const p = players.find(p => p.name === potentialName);
      if (p) {
          playerName = p.name;
          actionText = parts.slice(1).join(': ').trim();
      }
  }

  if (!playerName) return null;

  const lowerRest = actionText.toLowerCase();
  let type = 'unknown';
  let amount = 0;

  if (lowerRest.includes('folds')) type = 'fold';
  else if (lowerRest.includes('checks')) type = 'check';
  else if (lowerRest.includes('calls')) {
      type = 'call';
      amount = extractAmount(actionText);
  }
  else if (lowerRest.includes('bets')) {
      type = 'bet';
      amount = extractAmount(actionText);
  }
  else if (lowerRest.includes('raises')) {
      type = 'raise';
      amount = extractAmount(actionText);
  }
  else if (lowerRest.includes('posts')) {
      type = 'post';
      amount = extractAmount(actionText);
  }
  else if (lowerRest.includes('all-in')) {
      type = 'all-in';
      amount = extractAmount(actionText);
  }
  else if (lowerRest.includes('wins') || lowerRest.includes('collected') || lowerRest.includes('won')) {
      type = 'win';
      amount = extractAmount(actionText);
  }
  else {
      return null;
  }

  return {
    player: playerName,
    seat: players.find(p => p.name === playerName)?.seat || 0,
    type,
    amount
  };
}

function extractAmount(text) {
  if (!text) return 0;
  const match = text.match(/(\d+(\.\d+)?)/);
  return match ? parseFloat(match[0]) : 0;
}