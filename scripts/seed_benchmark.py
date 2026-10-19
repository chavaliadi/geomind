#!/usr/bin/env python3
"""
Seeds 100,000 synthetic places across the Prayagraj bounding box
(25.3-25.6 N, 81.7-82.0 E) to reproduce the spatial-index benchmark
documented in README.md and docs/perf/.

Usage:
    DATABASE_URL=postgresql://user:pass@host:port/geomind \
        python3 scripts/seed_benchmark.py

Requires: pip install psycopg2-binary

Deterministic (seeded at 42), so repeated runs produce identical data.
Appends rather than replacing — running it twice gives you 200k rows.
Runs ANALYZE afterwards so the query planner has fresh statistics.
"""

import os
import random
import sys
import time

import psycopg2
from psycopg2.extras import execute_values

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5434/geomind"
)

CATEGORIES = ["grocery", "pharmacy", "clothing", "general"]
PREFIXES = {
    "grocery": ["Mart", "Supermarket", "Kirana", "Grocery", "Bazaar", "Daily Needs"],
    "pharmacy": ["Pharmacy", "Medicos", "Medical Store", "Chemist", "Healthcare"],
    "clothing": ["Trends", "Fashion", "Apparels", "Garments", "Boutique", "Wear"],
    "general": ["Mall", "Plaza", "Store", "Emporium", "Center"],
}

LAT_MIN, LAT_MAX = 25.3000, 25.6000
LNG_MIN, LNG_MAX = 81.7000, 82.0000
TOTAL_RECORDS = 100000
BATCH_SIZE = 10000


def seed():
    print(f"Connecting to {DATABASE_URL}...")
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        cur.execute("SELECT COUNT(*) FROM places;")
        initial_count = cur.fetchone()[0]
        print(f"Current places count: {initial_count}")

        print(f"Generating and inserting {TOTAL_RECORDS} places in batches of {BATCH_SIZE}...")
        start_time = time.time()

        random.seed(42)  # Deterministic seed

        inserted = 0
        while inserted < TOTAL_RECORDS:
            batch = []
            for i in range(BATCH_SIZE):
                idx = inserted + i + 1
                cat = random.choice(CATEGORIES)
                prefix = random.choice(PREFIXES[cat])
                name = f"Synthetic {prefix} #{idx}"
                lat = random.uniform(LAT_MIN, LAT_MAX)
                lng = random.uniform(LNG_MIN, LNG_MAX)
                price_level = random.choice([1, 2, 3, None])
                rating = round(random.uniform(2.5, 5.0), 1)

                # POINT(lng lat)
                batch.append((name, cat, price_level, rating, lng, lat))

            execute_values(
                cur,
                """
                INSERT INTO places (name, category, price_level, rating, geom)
                VALUES %s;
                """,
                batch,
                template="(%s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326))"
            )
            inserted += len(batch)
            print(f"  Inserted {inserted}/{TOTAL_RECORDS}...")

        conn.commit()
        duration = time.time() - start_time

        cur.execute("SELECT COUNT(*) FROM places;")
        final_count = cur.fetchone()[0]
        print(f"Seeded {TOTAL_RECORDS} records in {duration:.2f}s. Total places: {final_count}")

        # Refresh planner statistics so EXPLAIN reflects the new row count
        print("Running ANALYZE places...")
        cur.execute("ANALYZE places;")
        conn.commit()

    except Exception as e:
        conn.rollback()
        print(f"Seeding failed: {e}")
        sys.exit(1)
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    seed()