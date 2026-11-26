-- Key/value store for user preferences the backend needs to compute figures (rakeback rates,
-- volume goals...). Additive and idempotent.
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
