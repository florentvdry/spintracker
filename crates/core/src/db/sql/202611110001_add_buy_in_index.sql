-- Lets the list of buy-ins be read from the index alone instead of scanning every hand.
CREATE INDEX IF NOT EXISTS idx_hands_buy_in_player_count ON hands(buy_in, player_count);
