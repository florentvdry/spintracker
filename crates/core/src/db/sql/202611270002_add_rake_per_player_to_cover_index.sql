-- The dashboard and winrate-chart queries read `rake_per_player` through `INDEXED BY idx_hands_cover`
-- when no date range is given. SQLite only reads columns of that index, so add `rake_per_player` to it.
DROP INDEX IF EXISTS idx_hands_cover;
CREATE INDEX idx_hands_cover
    ON hands(id, date_time, room, game_id, buy_in, prize_pool, player_count, multiplier, position, ante, blinds, rake_per_player);
