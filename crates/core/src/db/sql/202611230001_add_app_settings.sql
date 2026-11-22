-- Key/value store for user preferences the backend needs to compute figures (PoolEV multiplier
-- tables, rakeback, goals...). Additive and idempotent.
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
