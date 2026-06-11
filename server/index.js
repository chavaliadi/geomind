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

app.use(cors({
  origin: [
    "http://localhost:3001",
    "http://localhost:3000",
    "http://localhost:3002",
    "http://localhost:3003",
  ],
  methods: ["GET", "POST", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: "10kb" }));

// ── DB ────────────────────────────────────────────────────────────────────────
console.log("DATABASE_URL:", process.env.DATABASE_URL ? "Found" : "Missing");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Expose pool on app.locals so route modules can access it
app.locals.pool = pool;

pool.query("SELECT NOW()", (err, res) => {
  if (err) console.error("❌ DB Connection Failed:", err.message);
  else     console.log("✅ DB Connected:", res.rows[0].now);
});

// ── Mount all routes ──────────────────────────────────────────────────────────
app.use("/auth",               authRoutes);
app.use("/api/smart-bundle",   protect, bundleRoutes);
app.use("/api/optimize-route", protect, routeRoutes);

// ── Health ──────────────────────────────────────────────────────────────────────────
app.get("/health", async (req, res) => {
  console.log("Health endpoint hit");
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ status: "ok", time: result.rows[0] });
  } catch (err) {
    console.error("Health check error:", err);
    res.status(500).json({ error: "DB connection failed" });
  }
});

// ── Helper Functions ──────────────────────────────────────────────────────────
function getFallbackCategory(text) {
  const t = text.toLowerCase();
  const keywordMap = {
    clothing: ["shirt", "clothes", "dress", "wear"],
    grocery:  ["apple", "milk", "fruit", "vegetable", "grocery"],
    pharmacy: ["medicine", "tablet", "pharmacy"],
  };
  for (const [category, keywords] of Object.entries(keywordMap)) {
    if (keywords.some(kw => t.includes(kw))) return category;
  }
  return "general";
}

async function categorizeTask(text, category_override) {
  const validCategories = ["general", "grocery", "pharmacy", "clothing"];

  if (category_override && validCategories.includes(category_override))
    return category_override;

  try {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 2000);

    const mlResponse = await fetch("http://localhost:5001/predict", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ text }),
      signal:  controller.signal,
    });
    clearTimeout(timeoutId);

    if (!mlResponse.ok) throw new Error(`ML status ${mlResponse.status}`);

    const mlData = await mlResponse.json();
    if (mlData?.category && validCategories.includes(mlData.category)) {
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
    const mlResponse = await fetch("http://localhost:5001/urgency", {
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
  task, lat, lng,
  categoryLastTriggered, triggeredCategories, batchMap
) {
  const CATEGORY_COOLDOWN_MINUTES = 30;

  console.log(`  Checking task ${task.id} (${task.category}, ${task.priority} priority)...`);

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
    `SELECT name FROM places
     WHERE category = $3
       AND ST_DWithin(
         geom,
         ST_GeogFromText('POINT(' || $1 || ' ' || $2 || ')'),
         1000
       )
     LIMIT 1`,
    [lng, lat, task.category]
  );

  if (match.rows.length > 0) {
    console.log(`    ✅ TRIGGERED: ${match.rows[0].name}`);
    await pool.query(
      `UPDATE smart_tasks SET status = 'triggered', triggered_at = NOW() WHERE id = $1`,
      [task.id]
    );
    triggeredCategories.push(task.category);
    if (!batchMap[task.category]) batchMap[task.category] = [];
    batchMap[task.category].push({
      task_id:  task.id,
      task:     task.raw_text,
      place:    match.rows[0].name,
      priority: task.priority,
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
              triggered_at, created_at, cooldown_minutes
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
  const finalRadius     = Number(radius_meters) > 0 ? Number(radius_meters) : 1000;

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

app.patch("/api/tasks/:id", protect, async (req, res) => {
  const { id }     = req.params;
  const { status } = req.body;
  const validStatuses = ["pending", "triggered", "completed"];

  if (!status || !validStatuses.includes(status))
    return res.status(400).json({ error: "Invalid status" });

  try {
    const result = await pool.query(
      `UPDATE smart_tasks SET status = $1
       WHERE id = $2 AND user_id = $3
       RETURNING id, raw_text as text, category, priority, status`,
      [status, id, req.auth.userId]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Task not found" });
    console.log(`✅ Task ${id} → ${status}`);
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error updating task:", err);
    res.status(500).json({ error: "Failed to update task" });
  }
});

// ── Nearby ────────────────────────────────────────────────────────────────────
app.get("/nearby", protect, async (req, res) => {
  const { lat, lng, category } = req.query;
  if (!lat || !lng || !category)
    return res.status(400).json({ error: "lat, lng, category required" });

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
      [lng, lat, category, req.auth.userId, 5000]
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
  if (!lat || !lng) return res.status(400).json({ error: "lat and lng required" });

  console.log(`\n📍 Location: ${lat}, ${lng} — user ${req.auth.userId}`);

  try {
    const tasks = await pool.query(
      `SELECT id, category, cooldown_minutes, triggered_at, priority, raw_text
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
        task, lat, lng,
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