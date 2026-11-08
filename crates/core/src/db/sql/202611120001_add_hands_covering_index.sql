-- The columns the dashboard, session and chart queries read, in one index. `hands` rows are several
-- kilobytes (action texts) and these columns come after them, so reading them from the table walks
-- overflow pages: about three times slower than reading this index. Queries use it with
-- `INDEXED BY` when no date range is given (SQLite never picks it by itself).
CREATE INDEX IF NOT EXISTS idx_hands_cover
    ON hands(id, date_time, room, game_id, buy_in, prize_pool, player_count, multiplier, position, ante, blinds);
