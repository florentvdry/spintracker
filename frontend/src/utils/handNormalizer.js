/**
 * Normalizes various hand formats into a unified internal Hand Model for the Replayer.
 */
export function normalizeHand(input) {
  if (!input) return null;

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
      blinds.sb = parseFloat(parts[0]);
      blinds.bb = parseFloat(parts[1]);
      if (parts.length > 2) blinds.ante = parseFloat(parts[2]);
    }
  } else if (input.blinds) {
    blinds = input.blinds;
  }

  // Parse Board
  // Input board might be "AhKd2s" or ["Ah", "Kd", "2s"] or derived from street strings
  let board = [];
  if (Array.isArray(input.board)) {
    board = input.board;
  } else if (typeof input.board === 'string') {
    board = parseCards(input.board);
  } else {
    // Try to construct from street strings
    const flop = parseCards(input.flop);
    const turn = parseCards(input.turn);
    const river = parseCards(input.river);
    board = [...flop, ...turn, ...river];
  }

  // Players
  // The backend now returns a Players array in the JSON
  let players = [];
  if (input.Players && Array.isArray(input.Players)) {
    players = input.Players.map((p, idx) => ({
      seat: idx + 1, // Auto-assign seat if missing?
      name: p.Name || p.name,
      stack: p.Stack || p.stack,
      cards: p.cards || p.Cards, // "AhKh"
      isHero: p.IsHero !== undefined ? p.IsHero : p.isHero,
      position: p.Position || p.position
    }));
  } else if (input.players && Array.isArray(input.players)) {
    players = input.players.map((p, idx) => ({
      seat: p.seat || (idx + 1),
      name: p.name,
      stack: p.stack,
      cards: p.cards,
      isHero: p.isHero,
      position: p.position
    }));
  }

  // Actions
  // We need to parse text actions from input.preflop_action, input.flop_action, etc.
  const actions = [];
  
  // Helper to parse a block of text actions
  const parseActionBlock = (text, street) => {
    if (!text) return;
    const lines = text.split('\n');
    lines.forEach(line => {
      line = line.trim();
      if (!line) return;
      
      const action = parseActionLine(line, players);
      if (action) {
        actions.push({ ...action, street });
      }
    });
  };

  parseActionBlock(input.preflop_action || input.PreflopAction, 0); // Preflop
  parseActionBlock(input.flop_action || input.FlopAction, 1);       // Flop
  parseActionBlock(input.turn_action || input.TurnAction, 2);       // Turn
  parseActionBlock(input.river_action || input.RiverAction, 3);     // River
  
  // Parse Showdown / Summary for Winners
  // Usually found in 'result' or 'showdown' field, or sometimes 'summary'
  // Look for "wins Pot", "collected", etc.
  let summaryText = input.showdown || input.Showdown;
  
  if (!summaryText && (input.result || input.Result)) {
    // If we only have 'result', it might contain the FULL hand history (anonymized)
    // We need to extract ONLY the Summary/Showdown part to avoid duplicating actions
    const fullResult = input.result || input.Result;
    
    // Check if it looks like a full history
    if (fullResult.includes('*** HEADER ***') || fullResult.includes('Site:')) {
       // Try to find the start of showdown or summary
       const showdownIdx = fullResult.indexOf('*** SHOWDOWN ***');
       const summaryIdx = fullResult.indexOf('*** SUMMARY ***');
       
       if (showdownIdx !== -1) {
           summaryText = fullResult.substring(showdownIdx);
       } else if (summaryIdx !== -1) {
           summaryText = fullResult.substring(summaryIdx);
       } else {
           // Fallback: If no headers, maybe use the last few lines? 
           // Or just trust it if it's short.
           // For now, let's assume if it has preflop/flop headers it's full.
           if (fullResult.includes('*** PRE-FLOP ***')) {
               summaryText = ""; // Don't use full text if we can't find summary section
           } else {
               summaryText = fullResult;
           }
       }
    } else {
       summaryText = fullResult;
    }
  }
  
  parseActionBlock(summaryText, 4); // Showdown/End

  // Determine button seat from player positions
  const btnPlayer = players.find(p => p.position === 'BTN');
  const buttonSeat = btnPlayer ? btnPlayer.seat : 0;

  // Process Blinds to be "instant"
  // We want to remove 'post' actions from the timeline and apply them to initial state
  const timelineActions = [];
  
  // Clone players to avoid mutating input during this pass if we were reusing objects
  // But here 'players' is our local array, so we can mutate it.
  players.forEach(p => {
      p.initialBet = 0;
      // p.stack is the starting stack from hand history
  });

  actions.forEach(action => {
      if (action.type === 'post') {
          const p = players.find(pl => pl.name === action.player);
          if (p) {
              p.initialBet += action.amount;
              p.stack -= action.amount; // Reduce starting stack immediately
          }
      } else {
          timelineActions.push(action);
      }
  });

  const normalized = {
    id: input.HandId || input.id || Date.now().toString(),
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
}

export function parseCards(str) {
  if (!str) return [];
  // Remove spaces
  str = str.replace(/\s+/g, '');
  
  // Split by 2 chars: "AhKd" -> ["Ah", "Kd"]
  const cards = [];
  for (let i = 0; i < str.length; i += 2) {
    cards.push(str.substring(i, i + 2));
  }
  return cards;
}

function parseActionLine(line, players) {
  // 1. Strip timestamp prefix (e.g. "22:53:05 - ")
  let cleanLine = line.replace(/^\d{1,2}:\d{2}:\d{2}\s*-\s*/, '').trim();

  // 2. robust player detection (match longest names first to avoid partial matches)
  const sortedPlayers = [...players].sort((a, b) => b.name.length - a.name.length);

  let playerName = null;
  let actionText = "";

  for (const p of sortedPlayers) {
      if (cleanLine.startsWith(p.name)) {
          playerName = p.name;
          actionText = cleanLine.substring(p.name.length);
          
          // Verify boundary (colon or space)
          if (actionText.startsWith(':')) {
              actionText = actionText.substring(1).trim();
          } else if (actionText.startsWith(' ')) {
              actionText = actionText.trim();
          } else if (actionText !== "") {
             // Partial match (e.g. matched "Bob" in "Bobby"), continue searching
             playerName = null;
             continue;
          }
          break;
      }
  }

  // Fallback: Check for ": " separator if start match failed
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
      type = 'post'; // blind
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
      return null; // Irrelevant line (e.g. "shows")
  }

  return {
    player: playerName,
    seat: players.find(p => p.name === playerName)?.seat || 0,
    type,
    amount
  };
}

function extractAmount(text) {
  // "raises to 200" -> 200
  // "calls 50" -> 50
  // "posts small blind 10" -> 10
  const match = text.match(/(\d+(\.\d+)?)/);
  return match ? parseFloat(match[0]) : 0;
}
