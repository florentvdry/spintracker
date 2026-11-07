-- Files imported without all-in equity (a poker table was open) and still waiting to be completed.
-- Kept in the database so a restart does not leave those hands without equity for good.
ALTER TABLE import_files ADD COLUMN equity_pending INTEGER NOT NULL DEFAULT 0;
