-- "In position" is now worked out from the players still in the hand when the flop is dealt (it
-- was the button, even after the button folded). Stats that use it are computed again.
UPDATE custom_stats SET computed_hash = '' WHERE definition LIKE '%inPosition%';
