-- Money put into or taken out of the bankroll. A positive amount is a deposit, a negative one a
-- withdrawal. Additive: a new table, no existing data is read or changed.
CREATE TABLE bankroll_movements (
  id INTEGER PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount <> 0),
  note TEXT NOT NULL DEFAULT ''
);
