-- Rakeback percentage per room, set by the player. Additive only: no existing data is changed,
-- and a room without a row means 0 %, so the table can be created on any database.
CREATE TABLE rakeback_settings (
  room TEXT PRIMARY KEY,
  percent REAL NOT NULL DEFAULT 0 CHECK (percent >= 0 AND percent <= 100)
);
