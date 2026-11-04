-- Stats the user defined (see stats::custom). `computed_hash` equals `definition_hash` once the
-- hits of every hand have been computed for the current definition.
CREATE TABLE custom_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    definition TEXT NOT NULL,
    definition_hash TEXT NOT NULL,
    computed_hash TEXT NOT NULL DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sparse: a row exists only where the stat's denominator holds. bits: 1 = denominator, 2 = numerator.
CREATE TABLE custom_stat_hits (
    stat_id INTEGER NOT NULL,
    hand_id TEXT NOT NULL,
    player_name TEXT NOT NULL,
    bits INTEGER NOT NULL,
    PRIMARY KEY (stat_id, hand_id, player_name)
) WITHOUT ROWID;

CREATE INDEX idx_custom_stat_hits_player ON custom_stat_hits (player_name, hand_id);
