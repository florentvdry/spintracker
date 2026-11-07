-- From now on `buy_in` is what the player paid to enter (buy-in plus fee) in every room, and
-- the multiplier is the prize pool divided by it.

-- Unibet: the buy-in was stored without its fee, which also skewed the multiplier of the
-- tournaments whose summary file had been read.
UPDATE hands
SET buy_in = ROUND(buy_in + rake_per_player, 2)
WHERE room = 'Unibet' AND rake_per_player > 0;

UPDATE hands
SET multiplier = MAX(1, CAST(ROUND(prize_pool / buy_in) AS INTEGER))
WHERE room = 'Unibet' AND prize_pool > 0 AND buy_in > 0;

-- Winamax: only the hands read before their tournament summary still hold the buy-in without
-- the fee. They are recognised by the Expresso fee ratio (fee / buy-in = 7 / 93, within 1%), which the
-- hands completed by a summary (fee / entry cost = 7 / 100) never match.
UPDATE hands
SET buy_in = ROUND(buy_in + rake_per_player, 2)
WHERE room = 'Winamax' AND rake_per_player > 0 AND buy_in > 0
  AND ABS(rake_per_player * 93 - buy_in * 7) <= buy_in * 7 * 0.01;
