CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS hands (
    id TEXT PRIMARY KEY,
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
    preflop_action TEXT,
    flop TEXT,
    flop_action TEXT,
    turn TEXT,
    turn_action TEXT,
    river TEXT,
    river_action TEXT,
    showdown TEXT,
    result TEXT,
    all_in_street TEXT,
    went_to_showdown BOOLEAN DEFAULT 0,
    player_count INTEGER DEFAULT 2,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS player_hands (
    hand_id TEXT,
    player_name TEXT,
    position TEXT,
    stack INTEGER,
    cards TEXT,
    investment REAL DEFAULT 0,
    chips_won REAL DEFAULT 0,
    net_profit REAL DEFAULT 0,
    is_all_in BOOLEAN DEFAULT 0,
    went_to_showdown BOOLEAN DEFAULT 0,
    ev_chips REAL,
    net_won_adjusted REAL,
    showdown_winning REAL,
    non_showdown_winning REAL,
    equity_preflop REAL,
    equity_flop REAL,
    equity_turn REAL,
    equity_river REAL,
    cev_contribution REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (hand_id, player_name),
    FOREIGN KEY (hand_id) REFERENCES hands(id)
);

CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    total_hands INTEGER DEFAULT 0,
    total_profit REAL DEFAULT 0,
    total_ev_profit REAL DEFAULT 0,
    is_reg INTEGER DEFAULT 0,
    is_reg_forced INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hands_date ON hands(date_time);
CREATE INDEX IF NOT EXISTS idx_hands_game_id ON hands(game_id);
CREATE INDEX IF NOT EXISTS idx_player_hands_hand ON player_hands(hand_id);
CREATE INDEX IF NOT EXISTS idx_player_hands_player ON player_hands(player_name);
