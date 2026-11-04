-- Free-text note and colour tag the user attaches to a player; names are only unique per room.
CREATE TABLE player_notes (
    player_name TEXT NOT NULL,
    room TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    tag TEXT NOT NULL DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (player_name, room)
) WITHOUT ROWID;
