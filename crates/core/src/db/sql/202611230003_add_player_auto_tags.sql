-- Tags the application puts on players from their figures (see `services/auto_tags.rs`). They are
-- derived data: recomputed after every import, never edited by hand (the manual colour tag and the
-- note live in `player_notes`). Additive and idempotent.
CREATE TABLE IF NOT EXISTS player_auto_tags (
    room TEXT NOT NULL,
    player_name TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (room, player_name, tag)
);
CREATE INDEX IF NOT EXISTS idx_player_auto_tags_player ON player_auto_tags(player_name);
