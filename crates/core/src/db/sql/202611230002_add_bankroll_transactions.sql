-- Deposits and withdrawals entered by the user; the bankroll is these plus the tournament results.
-- `amount` is positive for a deposit and negative for a withdrawal.
CREATE TABLE IF NOT EXISTS bankroll_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    occurred_on TEXT NOT NULL,
    amount REAL NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bankroll_transactions_date ON bankroll_transactions(occurred_on);
