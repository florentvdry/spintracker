-- Every answer given in the range quiz. `answer_immediate` holds the id of the palette action the
-- player chose, so two actions with the same immediate play stay distinguishable.
CREATE TABLE training_attempts (
  id INTEGER PRIMARY KEY,
  scenario_id INTEGER NOT NULL,
  hand_class TEXT NOT NULL,
  source TEXT NOT NULL,
  hand_id TEXT,
  answer_immediate TEXT NOT NULL,
  answer_response TEXT,
  correct INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_training_attempts_scenario ON training_attempts(scenario_id, hand_class);
