-- Whether the hero's opponent was a regular, so the report can split fish and regulars.
-- The checks are derived data: they are cleared and recomputed on the next read.
ALTER TABLE hand_range_checks ADD COLUMN vs_reg INTEGER NOT NULL DEFAULT 0;
DELETE FROM hand_range_checks;
