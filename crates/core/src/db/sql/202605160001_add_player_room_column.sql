ALTER TABLE players ADD COLUMN room TEXT;

UPDATE players
SET room = (
    SELECT h.room
    FROM hands h
    JOIN player_hands ph ON h.id = ph.hand_id
    WHERE ph.player_name = players.name AND h.room IS NOT NULL AND h.room != ''
    GROUP BY h.room
    ORDER BY COUNT(*) DESC
    LIMIT 1
)
WHERE room IS NULL;
