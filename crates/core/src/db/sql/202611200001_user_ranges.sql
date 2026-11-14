-- The player's own preflop ranges: a shared action palette, situations ("spots"), one range per
-- stack depth, programs (named lists of spots) and settings. Nothing is shipped but the base actions.
CREATE TABLE range_actions (
  id INTEGER PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL,
  immediate TEXT NOT NULL,
  size_value REAL,
  size_unit TEXT,
  response TEXT NOT NULL DEFAULT 'none',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE range_spots (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  format TEXT NOT NULL,
  hero_position TEXT NOT NULL,
  line TEXT NOT NULL,
  line_sizes TEXT,
  opponent TEXT NOT NULL DEFAULT 'any',
  study_only INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_range_spots_situation ON range_spots(format, hero_position, line, opponent);

CREATE TABLE range_scenarios (
  id INTEGER PRIMARY KEY,
  spot_id INTEGER NOT NULL REFERENCES range_spots(id),
  stack_bb REAL NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (spot_id, stack_bb)
);

CREATE TABLE range_hands (
  scenario_id INTEGER NOT NULL REFERENCES range_scenarios(id),
  hand TEXT NOT NULL,
  action_id INTEGER NOT NULL REFERENCES range_actions(id),
  weight REAL NOT NULL DEFAULT 1.0,
  PRIMARY KEY (scenario_id, hand)
);
CREATE INDEX idx_range_hands_action ON range_hands(action_id);

CREATE TABLE range_programs (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE range_program_spots (
  program_id INTEGER NOT NULL REFERENCES range_programs(id),
  spot_id INTEGER NOT NULL REFERENCES range_spots(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (program_id, spot_id)
);

CREATE TABLE range_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO range_actions (label, color, immediate, size_value, size_unit, response, sort_order) VALUES
  ('Fold', '#2a2f39', 'fold', NULL, NULL, 'none', 0),
  ('Check', '#3b4352', 'check', NULL, NULL, 'none', 1),
  ('Call', '#4caf50', 'call', NULL, NULL, 'none', 2),
  ('Limp', '#7aa7ff', 'limp', NULL, NULL, 'none', 3),
  ('Raise', '#5b8def', 'raise', NULL, NULL, 'none', 4),
  ('All-in', '#ff6b5b', 'allin', NULL, NULL, 'none', 5);

INSERT INTO range_settings (key, value) VALUES
  ('default_stacks', '[25,20,15,10,7]'),
  ('depth_rule', 'nearest'),
  ('new_cards_per_day', '20'),
  ('prioritize_borderline', '1');
