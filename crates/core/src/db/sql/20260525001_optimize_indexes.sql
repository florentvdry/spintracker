DROP INDEX IF EXISTS idx_hands_date_time;
DROP INDEX IF EXISTS idx_player_hands_player_name;
DROP INDEX IF EXISTS idx_player_hands_hand_id;

CREATE INDEX IF NOT EXISTS idx_player_hands_name_hand_id ON player_hands(player_name, hand_id);
CREATE INDEX IF NOT EXISTS idx_hands_date_player_count ON hands(date_time, player_count);
