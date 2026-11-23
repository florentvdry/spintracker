-- Hands the player marked to review. They follow the same five boxes as the range cards
-- (`training_cards`): a hand answered well comes back later, one to look at again comes back
-- tomorrow. Additive and idempotent.
CREATE TABLE IF NOT EXISTS review_hands (
    hand_id TEXT PRIMARY KEY,
    box INTEGER NOT NULL DEFAULT 1 CHECK (box BETWEEN 1 AND 5),
    due_on TEXT NOT NULL,
    added_on TEXT NOT NULL,
    last_answer_at TEXT,
    note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_review_hands_due ON review_hands(due_on);
