-- Weekly and monthly targets for the number of tournaments. Additive: no existing data is read or
-- changed, and a period without a row simply has no goal.
CREATE TABLE goals (
  period TEXT PRIMARY KEY CHECK (period IN ('week', 'month')),
  target INTEGER NOT NULL CHECK (target > 0)
);
