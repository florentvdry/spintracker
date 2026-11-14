-- How each hero decision compares with the player's own range. Rows are derived data: any change
-- to the ranges clears the table and the next read recomputes what is missing.
CREATE TABLE hand_range_checks (
  hand_id TEXT PRIMARY KEY,
  hero_name TEXT,
  played_at TEXT,
  scenario_id INTEGER,
  hand_class TEXT NOT NULL,
  cards TEXT,
  format TEXT,
  hero_position TEXT,
  line TEXT,
  expected_action_id INTEGER,
  played_immediate TEXT,
  played_response TEXT,
  status TEXT NOT NULL,
  deviation_kind TEXT,
  depth_used_bb REAL,
  stack_bb REAL,
  ev_bb REAL,
  computed_at TEXT NOT NULL
);
CREATE INDEX idx_hand_range_checks_status ON hand_range_checks(status);
CREATE INDEX idx_hand_range_checks_scenario ON hand_range_checks(scenario_id);
CREATE INDEX idx_hand_range_checks_played_at ON hand_range_checks(played_at);
