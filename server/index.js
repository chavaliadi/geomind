const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
require("dotenv").config();

// ── Auth ──────────────────────────────────────────────────────────────────────
const { protect } = require("./middleware/auth");
const authRoutes  = require("./routes/auth");

// ── Phase 1 Routes ─────────────────────────────────────────────────────────────
const bundleRoutes = require("./routes/bundles");
const routeRoutes  = require("./routes/route");

const app = express();
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:5001";
const DEFAULT_RADIUS_METERS = 1000;
const MAX_RADIUS_METERS = 5000;
const VALID_CATEGORIES = ["general", "grocery", "pharmacy", "clothing"];
const DEFAULT_CORS_ORIGINS = [
  "http://localhost:3001",
  "http://localhost:3000",
  "http://localhost:3002",
  "http://localhost:3003",
];

app.use(cors({
  origin: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map(origin => origin.trim()).filter(Boolean)
    : DEFAULT_CORS_ORIGINS,
  methods: ["GET", "POST", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Guest-ID"],
}));
app.use(express.json({ limit: "10kb" }));

// ── DB ────────────────────────────────────────────────────────────────────────
console.log("DATABASE_URL:", process.env.DATABASE_URL ? "Found" : "Missing");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Expose pool on app.locals so route modules can access it
app.locals.pool = pool;

pool.query(`
  CREATE TABLE IF NOT EXISTS user_habits (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    category VARCHAR(50),
    item_text TEXT,
    completed_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS trigger_events (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    task_id INT REFERENCES smart_tasks(id) ON DELETE CASCADE,
    category VARCHAR(50),
    place_name TEXT,
    distance_m INT,
    radius_meters INT,
    priority VARCHAR(10),
    urgency_score FLOAT,
    reason JSONB DEFAULT '[]'::jsonb,
    triggered_at TIMESTAMPTZ DEFAULT NOW()
  );

  ALTER TABLE user_habits
    ADD COLUMN IF NOT EXISTS store_name TEXT,
    ADD COLUMN IF NOT EXISTS rating INT,
    ADD COLUMN IF NOT EXISTS task_id INT;
`).catch(err => console.error("❌ Schema bootstrap failed:", err.message));

pool.query("SELECT NOW()", (err, res) => {
  if (err) console.error("❌ DB Connection Failed:", err.message);
  else     console.log("✅ DB Connected:", res.rows[0].now);
});

// ── Mount all routes ──────────────────────────────────────────────────────────
app.use("/auth",               authRoutes);
app.use("/api/smart-bundle",   protect, bundleRoutes);
app.use("/api/optimize-route", protect, routeRoutes);

app.get("/health", async (req, res) => {
  console.log("Health endpoint hit");
  const healthStatus = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      database: "unknown",
      ml_service: "unknown",
      osrm_router: "configured",
      overpass_osm: "configured",
    },
  };

  // 1. Database Check
  try {
    const dbResult = await pool.query("SELECT NOW()");
    if (dbResult.rows.length > 0) {
      healthStatus.services.database = "healthy";
    } else {
      healthStatus.services.database = "unhealthy";
      healthStatus.status = "unhealthy";
    }
  } catch (err) {
    healthStatus.services.database = `unhealthy: ${err.message}`;
    healthStatus.status = "unhealthy";
  }

  // 2. ML Service Check
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const mlRes = await fetch(`${ML_SERVICE_URL}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (mlRes.ok) {
      const mlData = await mlRes.json();
      healthStatus.services.ml_service = mlData.model_loaded ? "healthy" : "degraded (models not loaded)";
      if (!mlData.model_loaded) {
        healthStatus.status = "degraded";
      }
    } else {
      healthStatus.services.ml_service = `unhealthy: HTTP ${mlRes.status}`;
      healthStatus.status = "unhealthy";
    }
  } catch (err) {
    healthStatus.services.ml_service = `unhealthy: ${err.message}`;
    healthStatus.status = "unhealthy";
  }

  // 3. Diagnostic configuration metadata
  healthStatus.services.osrm_router = process.env.OSRM_TRIP_BASE ? "configured (custom)" : "configured (default)";
  healthStatus.services.overpass_osm = "configured (default failover pool)";

  const statusCode = healthStatus.status === "unhealthy" ? 500 : 200;
  res.status(statusCode).json(healthStatus);
});

// ── Helper Functions ──────────────────────────────────────────────────────────
function parseCoordinate(value, min, max) {
  const num = Number(value);
  return Number.isFinite(num) && num >= min && num <= max ? num : null;
}

function normalizeRadius(value) {
  const radius = Number(value);
  if (!Number.isFinite(radius) || radius <= 0) return DEFAULT_RADIUS_METERS;
  return Math.min(Math.round(radius), MAX_RADIUS_METERS);
}

function getFallbackCategory(text) {
  const t = text.toLowerCase();
  const keywordMap = {
    clothing: ["shirt", "clothes", "dress", "wear"],
    grocery:  ["apple", "milk", "fruit", "vegetable", "grocery", "chips", "snack", "chocolate"],
    pharmacy: ["medicine", "tablet", "pharmacy"],
  };
  for (const [category, keywords] of Object.entries(keywordMap)) {
    if (keywords.some(kw => t.includes(kw))) return category;
  }
  return "general";
}

async function categorizeTask(text, category_override) {
  if (category_override && VALID_CATEGORIES.includes(category_override))
    return category_override;

  try {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 2000);

    const mlResponse = await fetch(`${ML_SERVICE_URL}/predict`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ text }),
      signal:  controller.signal,
    });
    clearTimeout(timeoutId);

    if (!mlResponse.ok) throw new Error(`ML status ${mlResponse.status}`);

    const mlData = await mlResponse.json();
    if (mlData?.category && VALID_CATEGORIES.includes(mlData.category)) {
      console.log(`\n🧠 ML Category: ${mlData.category} (conf: ${mlData.confidence.toFixed(2)})`);
      return mlData.category;
    }
    throw new Error("Invalid ML response");
  } catch (err) {
    console.warn(`\n⚠️ ML failed, using fallback. Reason: ${err.message}`);
    return getFallbackCategory(text);
  }
}

// ── Helper: call ML urgency scorer ─────────────────────────────────────────────────────
async function scoreUrgency(text) {
  try {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 2000);
    const mlResponse = await fetch(`${ML_SERVICE_URL}/urgency`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ text }),
      signal:  controller.signal,
    });
    clearTimeout(timeoutId);
    if (!mlResponse.ok) throw new Error(`Urgency ML status ${mlResponse.status}`);
    const data = await mlResponse.json();
    return {
      urgency_score:  data.urgency_score  ?? 0.5,
      urgency_reason: data.urgency_reason ?? null,
    };
  } catch (err) {
    console.warn(`⚠️ Urgency scoring failed: ${err.message}`);
    return { urgency_score: 0.5, urgency_reason: null };
  }
}

async function evaluateAndTriggerTask(
  task, parsedLat, parsedLng,
  categoryLastTriggered, triggeredCategories, batchMap
) {
  const CATEGORY_COOLDOWN_MINUTES = 30;

  const radiusMeters = normalizeRadius(task.radius_meters);

  console.log(`  Checking task ${task.id} (${task.category}, ${task.priority} priority, ${radiusMeters}m radius)...`);

  if (triggeredCategories.includes(task.category)) {
    console.log(`    ⏸️ Category '${task.category}' already triggered this cycle`);
    return;
  }

  if (categoryLastTriggered[task.category]) {
    const diff = (Date.now() - new Date(categoryLastTriggered[task.category])) / 60000;
    if (diff < CATEGORY_COOLDOWN_MINUTES) {
      console.log(`    ⏸️ Cooldown (${diff.toFixed(1)}min < ${CATEGORY_COOLDOWN_MINUTES}min)`);
      return;
    }
  }

  if (task.triggered_at) {
    const diff = (Date.now() - new Date(task.triggered_at)) / 60000;
    if (diff < task.cooldown_minutes) {
      console.log(`    ⏳ Skipped (task in cooldown)`);
      return;
    }
  }

  const match = await pool.query(
    `SELECT name,
            ROUND(ST_Distance(
              geom,
              ST_GeogFromText('POINT(' || $1 || ' ' || $2 || ')')
            )) AS distance_m
     FROM places
     WHERE category = $3
       AND (user_id = $5 OR user_id IS NULL)
       AND ST_DWithin(
         geom,
         ST_GeogFromText('POINT(' || $1 || ' ' || $2 || ')'),
         $4
       )
     ORDER BY distance_m ASC
     LIMIT 1`,
    [parsedLng, parsedLat, task.category, radiusMeters, task.user_id]
  );

  if (match.rows.length > 0) {
    const distanceM = Number(match.rows[0].distance_m);
    const urgencyScore = Number(task.urgency_score ?? 0.5);
    const formattedCategory = task.category.charAt(0).toUpperCase() + task.category.slice(1);
    const formattedPriority = task.priority.charAt(0).toUpperCase() + task.priority.slice(1);
    const reasons = [
      `${formattedCategory} location is close (${distanceM}m away)`,
      `Inside configured search radius (${radiusMeters}m)`,
      `Priority level: ${formattedPriority}`,
    ];
    if (urgencyScore >= 0.75) {
      reasons.push(`Urgency: High (${(urgencyScore * 100).toFixed(0)}%)`);
    }

    console.log(`    ✅ TRIGGERED: ${match.rows[0].name}`);
    await pool.query(
      `UPDATE smart_tasks SET status = 'triggered', triggered_at = NOW() WHERE id = $1`,
      [task.id]
    );
    await pool.query(
      `INSERT INTO trigger_events
         (user_id, task_id, category, place_name, distance_m, radius_meters, priority, urgency_score, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [task.user_id, task.id, task.category, match.rows[0].name, distanceM, radiusMeters,
       task.priority, urgencyScore, JSON.stringify(reasons)]
    );
    triggeredCategories.push(task.category);
    if (!batchMap[task.category]) batchMap[task.category] = [];
    batchMap[task.category].push({
      task_id:  task.id,
      task:     task.raw_text,
      place:    match.rows[0].name,
      priority: task.priority,
      distance_m: distanceM,
      urgency_score: urgencyScore,
      reasons,
    });
  } else {
    console.log(`    ❌ No nearby places`);
  }
}

// ── Tasks ─────────────────────────────────────────────────────────────────────
app.get("/api/tasks", protect, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, raw_text as text, category, priority, status,
              triggered_at, created_at, cooldown_minutes,
              radius_meters, urgency_score, urgency_reason
       FROM smart_tasks
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.auth.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching tasks:", err);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

const taskCreateHandler = async (req, res) => {
  const { text, priority, category_override, radius_meters } = req.body;

  if (!text || typeof text !== "string" || !text.trim())
    return res.status(400).json({ error: "Text is required" });
  if (text.trim().length > 200)
    return res.status(400).json({ error: "Task text must be ≤200 characters" });

  const validPriorities = ["high", "medium", "low"];
  const finalPriority   = validPriorities.includes(priority) ? priority : "medium";
  const finalRadius     = normalizeRadius(radius_meters);

  // Run ML classification + urgency scoring in parallel
  const [category, { urgency_score, urgency_reason }] = await Promise.all([
    categorizeTask(text, category_override),
    scoreUrgency(text),
  ]);

  console.log(`🔥 Urgency: "${text}" → ${urgency_score} (${urgency_reason || 'no signals'})`);

  try {
    const result = await pool.query(
      `INSERT INTO smart_tasks
         (raw_text, category, priority, user_id, radius_meters, urgency_score, urgency_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, raw_text as text, raw_text, category, priority,
                 status, triggered_at, created_at, cooldown_minutes,
                 radius_meters, urgency_score, urgency_reason`,
      [text, category, finalPriority, req.auth.userId, finalRadius, urgency_score, urgency_reason]
    );
    console.log(`✅ Task created: "${text}" (${finalPriority}, urgency: ${urgency_score}, radius: ${finalRadius}m)`);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
};

app.post("/tasks",     protect, taskCreateHandler);
app.post("/api/tasks", protect, taskCreateHandler);

app.delete("/api/tasks/:id", protect, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM smart_tasks WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, req.auth.userId]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Task not found" });
    res.json({ success: true, id });
  } catch (err) {
    console.error("Error deleting task:", err);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

app.get("/api/trigger-events", protect, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::int AS notifications_triggered,
         ROUND(AVG(distance_m))::int AS avg_distance_m,
         COUNT(DISTINCT category)::int AS categories_triggered,
         MAX(triggered_at) AS last_triggered_at
       FROM trigger_events
       WHERE user_id = $1`,
      [req.auth.userId]
    );

    const byCategory = await pool.query(
      `SELECT category, COUNT(*)::int AS count, ROUND(AVG(distance_m))::int AS avg_distance_m
       FROM trigger_events
       WHERE user_id = $1
       GROUP BY category
       ORDER BY count DESC`,
      [req.auth.userId]
    );

    res.json({ summary: rows[0], by_category: byCategory.rows });
  } catch (err) {
    console.error("Trigger event stats error:", err);
    res.status(500).json({ error: "Failed to load trigger event stats" });
  }
});


app.patch("/api/tasks/:id", protect, async (req, res) => {
  const { id } = req.params;
  const { status, chosen_store, rating } = req.body;
  const validStatuses = ["pending", "triggered", "completed"];

  if (!status || !validStatuses.includes(status))
    return res.status(400).json({ error: "Invalid status" });

  try {
    const result = await pool.query(
      `UPDATE smart_tasks SET status = $1
       WHERE id = $2 AND user_id = $3
       RETURNING id, raw_text as text, raw_text, category, priority, status`,
      [status, id, req.auth.userId]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Task not found" });

    const task = result.rows[0];
    if (status === "completed") {
      await pool.query(
        `INSERT INTO user_habits (user_id, category, item_text, store_name, rating, task_id, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [req.auth.userId, task.category, task.raw_text || task.text,
         typeof chosen_store === "string" ? chosen_store.slice(0, 200) : null,
         Number.isInteger(Number(rating)) ? Number(rating) : null,
         task.id]
      );
    }

    console.log(`✅ Task ${id} → ${status}`);
    res.json(task);
  } catch (err) {
    console.error("Error updating task:", err);
    res.status(500).json({ error: "Failed to update task" });
  }
});

// ── Nearby ────────────────────────────────────────────────────────────────────
app.get("/nearby", protect, async (req, res) => {
  const { lat, lng, category } = req.query;
  const parsedLat = parseCoordinate(lat, -90, 90);
  const parsedLng = parseCoordinate(lng, -180, 180);
  if (parsedLat === null || parsedLng === null || !VALID_CATEGORIES.includes(category))
    return res.status(400).json({ error: "Valid lat, lng, and category required" });

  try {
    const result = await pool.query(
      `SELECT name, category, price_level, rating,
              ST_Y(geom::geometry) as lat,
              ST_X(geom::geometry) as lng,
              ROUND(ST_Distance(
                geom,
                ST_GeogFromText('POINT(' || $1 || ' ' || $2 || ')')
              )) AS distance
       FROM places
       WHERE category = $3
         AND (user_id = $4 OR user_id IS NULL)
         AND ST_DWithin(geom, ST_GeogFromText('POINT(' || $1 || ' ' || $2 || ')'), $5)
       ORDER BY distance ASC`,
      [parsedLng, parsedLat, category, req.auth.userId, MAX_RADIUS_METERS]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Geo query error:", err);
    res.status(500).json({ error: "Geo query failed" });
  }
});

// ── Location trigger ──────────────────────────────────────────────────────────
app.post("/location", protect, async (req, res) => {
  const { lat, lng } = req.body;
  const parsedLat = parseCoordinate(lat, -90, 90);
  const parsedLng = parseCoordinate(lng, -180, 180);
  if (parsedLat === null || parsedLng === null)
    return res.status(400).json({ error: "Valid lat and lng required" });

  console.log(`\n📍 Location: ${lat}, ${lng} — user ${req.auth.userId}`);

  try {
    const tasks = await pool.query(
      `SELECT id, category, cooldown_minutes, triggered_at, priority, raw_text,
              radius_meters, user_id, urgency_score
       FROM smart_tasks
       WHERE status = 'pending' AND user_id = $1
       ORDER BY
         CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         created_at DESC`,
      [req.auth.userId]
    );
    console.log(`📋 ${tasks.rows.length} pending tasks`);

    const categoryLastTriggered = {};
    const categoryChecks = await pool.query(
      `SELECT category, MAX(triggered_at) as last_triggered
       FROM smart_tasks
       WHERE status = 'triggered' AND user_id = $1
       GROUP BY category`,
      [req.auth.userId]
    );
    categoryChecks.rows.forEach(r => {
      categoryLastTriggered[r.category] = r.last_triggered;
    });

    const batchMap           = {};
    const triggeredCategories = [];

    for (const task of tasks.rows) {
      await evaluateAndTriggerTask(
        task, parsedLat, parsedLng,
        categoryLastTriggered, triggeredCategories, batchMap
      );
    }

    const batches = Object.keys(batchMap).map(category => {
      const order = { high: 1, medium: 2, low: 3 };
      const sorted = batchMap[category].sort((a, b) => order[a.priority] - order[b.priority]);
      return { category, count: sorted.length, tasks: sorted.slice(0, 5) };
    });

    console.log(`✅ ${batches.length} batch(es)\n`);
    res.json({ batches });
  } catch (err) {
    console.error("❌ Trigger error:", err);
    res.status(500).json({ error: "Trigger engine failed" });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));