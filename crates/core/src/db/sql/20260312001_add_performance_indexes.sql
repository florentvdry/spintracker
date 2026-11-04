CREATE INDEX IF NOT EXISTS idx_hands_date_time ON hands(date_time);
CREATE INDEX IF NOT EXISTS idx_hands_room ON hands(room);
CREATE INDEX IF NOT EXISTS idx_hands_game_id ON hands(game_id);
CREATE INDEX IF NOT EXISTS idx_player_hands_player_name ON player_hands(player_name);
CREATE INDEX IF NOT EXISTS idx_player_hands_hand_id ON player_hands(hand_id);
CREATE INDEX IF NOT EXISTS idx_player_hands_position ON player_hands(position);
