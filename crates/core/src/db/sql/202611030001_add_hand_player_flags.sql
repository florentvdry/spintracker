-- Stat flags computed once per player and hand (see stats::flags). flags_N are 60-bit words.
CREATE TABLE IF NOT EXISTS hand_player_flags (
    hand_id TEXT NOT NULL,
    player_name TEXT NOT NULL,
    flags_version INTEGER NOT NULL,
    flags_0 INTEGER NOT NULL DEFAULT 0,
    flags_1 INTEGER NOT NULL DEFAULT 0,
    flags_2 INTEGER NOT NULL DEFAULT 0,
    flags_3 INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (hand_id, player_name)
) WITHOUT ROWID;
