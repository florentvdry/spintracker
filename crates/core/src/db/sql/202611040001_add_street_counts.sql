-- Player actions per street and kind, packed 4 bits each (see stats::postflop::StreetCounts).
ALTER TABLE hand_player_flags ADD COLUMN street_counts INTEGER NOT NULL DEFAULT 0;
