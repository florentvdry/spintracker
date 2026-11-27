-- The dashboard now sums hands.rake for the rakeback figure, and the whole-history scan reads it
-- through idx_hands_cover (INDEXED BY forces this index). Recreate it so `rake` is covered even
-- on databases where the index already exists (`CREATE INDEX IF NOT EXISTS` would skip them).
DROP INDEX IF EXISTS idx_hands_cover;
CREATE INDEX idx_hands_cover
    ON hands(id, date_time, room, game_id, buy_in, prize_pool, player_count, multiplier, position, ante, blinds, rake);
