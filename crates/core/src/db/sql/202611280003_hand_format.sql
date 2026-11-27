-- Tournament format of each hand: classic Expresso or Nitro. Additive: existing rows get the
-- default, then the Nitro ones are set from their game name (the same rule as `tournament_format`
-- for new imports). Nothing else in the table changes.
ALTER TABLE hands ADD COLUMN format TEXT NOT NULL DEFAULT 'expresso';
UPDATE hands SET format = 'nitro' WHERE game_name LIKE '%nitro%';
