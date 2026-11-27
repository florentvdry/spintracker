-- Hands the player marked to review later. Additive: a new table, nothing existing is read or changed.
CREATE TABLE marked_hands (
  hand_id TEXT PRIMARY KEY,
  marked_at TEXT NOT NULL
);
