-- ─────────────────────────────────────────────────────────────
-- GeoMind — Phase 1 Migration: Smart Errand Intelligence
-- Run with: psql $DATABASE_URL -f server/migrations/001_phase1_smart_errand.sql
-- All statements are idempotent (safe to re-run).
-- ─────────────────────────────────────────────────────────────

-- 1. Add urgency_score to smart_tasks
--    Default 0.5 = neutral urgency for existing rows
ALTER TABLE smart_tasks
  ADD COLUMN IF NOT EXISTS urgency_score   FLOAT   DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS urgency_reason  TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS radius_meters   INT     DEFAULT 1000;

-- 2. Enrich places table for store matching
ALTER TABLE places
  ADD COLUMN IF NOT EXISTS price_level  INT     DEFAULT NULL,  -- 1=budget, 2=mid, 3=premium
  ADD COLUMN IF NOT EXISTS rating       FLOAT   DEFAULT NULL,  -- 0.0–5.0
  ADD COLUMN IF NOT EXISTS user_id      TEXT    DEFAULT NULL;  -- NULL = global, else user-specific

-- 3. Add spatial index on places.geom if not exists (speeds up PostGIS proximity queries)
CREATE INDEX IF NOT EXISTS idx_places_geom ON places USING GIST (geom);

-- 4. Add index on smart_tasks for user + status lookups
CREATE INDEX IF NOT EXISTS idx_tasks_user_status
  ON smart_tasks (user_id, status)
  WHERE status = 'pending';

-- 5. user_habits table — Phase 2 (create now, populate in Phase 2)
CREATE TABLE IF NOT EXISTS user_habits (
  id           SERIAL PRIMARY KEY,
  user_id      TEXT        NOT NULL,
  category     VARCHAR(50),
  item_text    TEXT,
  completed_at TIMESTAMP   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_habits_user_cat
  ON user_habits (user_id, category, completed_at DESC);

-- ─────────────────────────────────────────────────────────────
-- Verify
-- ─────────────────────────────────────────────────────────────
SELECT 'smart_tasks columns' AS check,
       column_name, data_type
FROM information_schema.columns
WHERE table_name = 'smart_tasks'
  AND column_name IN ('urgency_score', 'urgency_reason', 'radius_meters')
ORDER BY column_name;

SELECT 'places columns' AS check,
       column_name, data_type
FROM information_schema.columns
WHERE table_name = 'places'
  AND column_name IN ('price_level', 'rating', 'user_id')
ORDER BY column_name;

SELECT 'user_habits exists' AS check, COUNT(*) FROM user_habits;
