-- Spaced-review cards: one per hand of a range the player has been asked about.
CREATE TABLE training_cards (
  scenario_id INTEGER NOT NULL,
  hand_class TEXT NOT NULL,
  box INTEGER NOT NULL CHECK (box BETWEEN 1 AND 5),
  due_on TEXT NOT NULL,
  last_answer_at TEXT,
  created_on TEXT NOT NULL,
  PRIMARY KEY (scenario_id, hand_class)
);
CREATE INDEX idx_training_cards_due ON training_cards(due_on);
