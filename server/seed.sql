-- GeoMind Seed Script
-- Location: Prayagraj, India (test area: 25.432247°N, 81.770706°E)
-- Run with: psql $DATABASE_URL -f seed.sql

-- ─────────────────────────────────────────────
-- 1. Create extension + tables (safe / idempotent)
-- ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS smart_tasks (
  id               SERIAL PRIMARY KEY,
  raw_text         TEXT NOT NULL,
  category         VARCHAR(50),
  priority         VARCHAR(10) DEFAULT 'medium',
  status           VARCHAR(20) DEFAULT 'pending',
  triggered_at     TIMESTAMP,
  created_at       TIMESTAMP DEFAULT NOW(),
  cooldown_minutes INT DEFAULT 30
);

CREATE TABLE IF NOT EXISTS places (
  id       SERIAL PRIMARY KEY,
  name     TEXT,
  category VARCHAR(50),
  geom     geometry(Point, 4326)
);

-- ─────────────────────────────────────────────
-- 2. Clear existing seed data
-- ─────────────────────────────────────────────
TRUNCATE TABLE places RESTART IDENTITY CASCADE;

-- ─────────────────────────────────────────────
-- 3. Insert places (Prayagraj area)
--    ST_GeomFromText('POINT(lng lat)', 4326)
-- ─────────────────────────────────────────────

-- 🛒 Grocery stores
INSERT INTO places (name, category, geom) VALUES
  ('Big Bazaar Prayagraj',       'grocery',  ST_GeomFromText('POINT(81.8364 25.4558)', 4326)),
  ('D-Mart Civil Lines',         'grocery',  ST_GeomFromText('POINT(81.8340 25.4540)', 4326)),
  ('Vishal Mega Mart',           'grocery',  ST_GeomFromText('POINT(81.8319 25.4448)', 4326)),
  ('More Supermarket',           'grocery',  ST_GeomFromText('POINT(81.8400 25.4600)', 4326)),
  ('Kanpur Road Grocery Hub',    'grocery',  ST_GeomFromText('POINT(81.7707 25.4322)', 4326));

-- 💊 Pharmacies
INSERT INTO places (name, category, geom) VALUES
  ('Apollo Pharmacy Civil Lines','pharmacy', ST_GeomFromText('POINT(81.8350 25.4555)', 4326)),
  ('MedPlus George Town',        'pharmacy', ST_GeomFromText('POINT(81.8310 25.4440)', 4326)),
  ('Jan Aushadhi Kendra',        'pharmacy', ST_GeomFromText('POINT(81.8290 25.4430)', 4326)),
  ('Rathi Medical Store',        'pharmacy', ST_GeomFromText('POINT(81.8420 25.4610)', 4326)),
  ('City Medicals Naini',        'pharmacy', ST_GeomFromText('POINT(81.8939 25.3817)', 4326));

-- 👕 Clothing stores
INSERT INTO places (name, category, geom) VALUES
  ('Pantaloons Civil Lines',     'clothing', ST_GeomFromText('POINT(81.8360 25.4560)', 4326)),
  ('Westside Prayagraj',         'clothing', ST_GeomFromText('POINT(81.8345 25.4545)', 4326)),
  ('Fabindia George Town',       'clothing', ST_GeomFromText('POINT(81.8315 25.4445)', 4326)),
  ('Max Fashion Retail',         'clothing', ST_GeomFromText('POINT(81.8410 25.4605)', 4326)),
  ('V-Mart Naini',               'clothing', ST_GeomFromText('POINT(81.8940 25.3820)', 4326));

-- 📌 General / misc
INSERT INTO places (name, category, geom) VALUES
  ('Anand Bhawan',               'general',  ST_GeomFromText('POINT(81.8378 25.4579)', 4326)),
  ('Prayagraj Junction Area',    'general',  ST_GeomFromText('POINT(81.8942 25.4530)', 4326)),
  ('Civil Lines Market',         'general',  ST_GeomFromText('POINT(81.8380 25.4560)', 4326));

-- ─────────────────────────────────────────────
-- 4. Verify
-- ─────────────────────────────────────────────
SELECT category, COUNT(*) AS count FROM places GROUP BY category ORDER BY category;
