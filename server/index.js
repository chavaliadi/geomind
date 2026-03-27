const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const { ClerkExpressWithAuth } = require("@clerk/clerk-sdk-node");
require("dotenv").config();

const app = express();
app.use(cors({
  origin: ["http://localhost:3001", "http://localhost:3000", "http://localhost:3002", "http://localhost:3003"],
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: "10kb" }));

// Phase 8A: Clerk Auth Protection
const requireAuth = ClerkExpressWithAuth();
const enforceUser = (req, res, next) => {
  if (!req.auth || !req.auth.userId) {
    return res.status(401).json({ error: "Unauthorized access. Please login." });
  }
  next();
};
const protect = [requireAuth, enforceUser];

console.log("DATABASE_URL:", process.env.DATABASE_URL ? "Found" : "Missing");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Test DB connection on startup
pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error("❌ DB Connection Failed:", err.message);
  } else {
    console.log("✅ DB Connected:", res.rows[0].now);
  }
});

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

// GET /api/tasks - Retrieve all tasks
app.get("/api/tasks", protect, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, 
        raw_text as text, 
        category, 
        priority, 
        status, 
        triggered_at, 
        created_at,
        cooldown_minutes
      FROM smart_tasks
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [req.auth.userId]);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching tasks:", err);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

// --- Helper Functions ---
function getFallbackCategory(text) {
  const t = text.toLowerCase();
  const keywordMap = {
    clothing: ["shirt", "clothes", "dress", "wear"],
    grocery: ["apple", "milk", "fruit", "vegetable", "grocery"],
    pharmacy: ["medicine", "tablet", "pharmacy"]
  };
  
  for (const [category, keywords] of Object.entries(keywordMap)) {
    if (keywords.some(keyword => t.includes(keyword))) {
      return category;
    }
  }
  return "general";
}

async function categorizeTask(text, category_override) {
  const validCategories = ["general", "grocery", "pharmacy", "clothing"];
  
  // 1. Check override
  if (category_override && validCategories.includes(category_override)) {
    return category_override;
  }
  
  // 2. Try ML Service
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 500); 
    
    const mlResponse = await fetch("http://localhost:5001/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!mlResponse.ok) {
      throw new Error(`ML Service responded with status ${mlResponse.status}`);
    }

    const mlData = await mlResponse.json();
    if (mlData && mlData.category && validCategories.includes(mlData.category)) {
      console.log(`\n🧠 ML Category: ${mlData.category} (conf: ${mlData.confidence.toFixed(2)}, fallback: ${mlData.used_fallback})`);
      return mlData.category;
    } else {
      throw new Error("Invalid ML response format");
    }
  } catch (err) {
    console.warn(`\n⚠️ ML failed, using fallback. Reason: ${err.message}`);
    return getFallbackCategory(text);
  }
}

async function evaluateAndTriggerTask(task, lat, lng, categoryLastTriggered, triggeredCategories, batchMap) {
  const CATEGORY_COOLDOWN_MINUTES = 30;

  console.log(`  Checking task ${task.id} (${task.category}, ${task.priority} priority)...`);

  if (triggeredCategories.includes(task.category)) {
    console.log(`    ⏸️ Category '${task.category}' already triggered this cycle (batching)`);
    return;
  }

  if (categoryLastTriggered[task.category]) {
    const diff = (Date.now() - new Date(categoryLastTriggered[task.category])) / 60000;
    if (diff < CATEGORY_COOLDOWN_MINUTES) {
      console.log(`    ⏸️ Category '${task.category}' in cooldown (${diff.toFixed(1)}min < ${CATEGORY_COOLDOWN_MINUTES}min)`);
      return;
    }
  }

  if (task.triggered_at) {
    const diff = (Date.now() - new Date(task.triggered_at)) / 60000;
    if (diff < task.cooldown_minutes) {
      console.log(`    ⏳ Skipped (in cooldown)`);
      return;
    }
  }

  const match = await pool.query(
    `
    SELECT name
    FROM places
    WHERE category = $3
    AND ST_DWithin(
      geom,
      ST_GeogFromText('POINT(' || $1 || ' ' || $2 || ')'),
      1000
    )
    LIMIT 1
    `,
    [lng, lat, task.category]
  );

  if (match.rows.length > 0) {
    console.log(`    ✅ TRIGGERED: ${match.rows[0].name}`);
    await pool.query(
      `
      UPDATE smart_tasks
      SET status = 'triggered', triggered_at = NOW()
      WHERE id = $1
      `,
      [task.id]
    );

    triggeredCategories.push(task.category);

    if (!batchMap[task.category]) {
      batchMap[task.category] = [];
    }

    batchMap[task.category].push({
      task_id: task.id,
      task: task.raw_text,
      place: match.rows[0].name,
      priority: task.priority,
    });
  } else {
    console.log(`    ❌ No nearby places found`);
  }
}

app.post("/tasks", protect, async (req, res) => {
  const { text, priority, category_override, radius_meters } = req.body;
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({ error: "Text is required" });
  }
  if (text.trim().length > 200) {
    return res.status(400).json({ error: "Task text must be 200 characters or less" });
  }

  // Validate priority if provided
  const validPriorities = ["high", "medium", "low"];
  const finalPriority = priority && validPriorities.includes(priority) ? priority : "medium";
  const finalRadius = (Number(radius_meters) > 0) ? Number(radius_meters) : 1000;

  const category = await categorizeTask(text, category_override);

  try {
    const result = await pool.query(
      `INSERT INTO smart_tasks (raw_text, category, priority, user_id, radius_meters)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, raw_text as text, raw_text, category, priority, status, triggered_at, created_at, cooldown_minutes, radius_meters`,
      [text, category, finalPriority, req.auth.userId, finalRadius]
    );
    console.log(`✅ Task created: "${text}" (${finalPriority} priority, radius: ${finalRadius}m)`);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// DELETE /api/tasks/:id - Delete a task
app.delete("/api/tasks/:id", protect, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `DELETE FROM smart_tasks WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, req.auth.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json({ success: true, id });
  } catch (err) {
    console.error("Error deleting task:", err);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

app.get("/nearby", protect, async (req, res) => {
  const { lat, lng, category } = req.query;

  if (!lat || !lng || !category) {
    return res.status(400).json({ error: "lat, lng, category required" });
  }

  try {
    const result = await pool.query(
      `
      SELECT 
        name, 
        category, 
        price_level, 
        rating,
        ST_Y(geom::geometry) as lat,
        ST_X(geom::geometry) as lng,
        ROUND(
          ST_Distance(
            geom,
            ST_GeogFromText('POINT(' || $1 || ' ' || $2 || ')')
          )
        ) AS distance
      FROM places
      WHERE category = $3 AND (user_id = $4 OR user_id IS NULL)
      AND ST_DWithin(
        geom,
        ST_GeogFromText('POINT(' || $1 || ' ' || $2 || ')'),
        $5
      )
      ORDER BY distance ASC
      `,
      [lng, lat, category, req.auth.userId, 5000] // Hardcoded 5000 or use req.query.radius
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Geo query error:", err);
    res.status(500).json({ error: "Geo query failed" });
  }
});

app.post("/location", protect, async (req, res) => {
  const { lat, lng } = req.body;

  if (!lat || !lng) {
    return res.status(400).json({ error: "lat and lng required" });
  }

  console.log(`\n📍 Location received: ${lat}, ${lng} from user ${req.auth.userId}`);

  try {
    const tasks = await pool.query(`
    SELECT id, category, cooldown_minutes, triggered_at, priority, raw_text
    FROM smart_tasks
    WHERE status = 'pending' AND user_id = $1
    ORDER BY 
      CASE priority
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
        ELSE 4
      END ASC,
      created_at DESC
    `, [req.auth.userId]);

    console.log(`📋 Found ${tasks.rows.length} pending tasks`);

    // Phase 3C-C: Get category-level cooldown info (30 min default)
    const CATEGORY_COOLDOWN_MINUTES = 30;
    const categoryLastTriggered = {};

    const categoryChecks = await pool.query(`
      SELECT 
        category, 
        MAX(triggered_at) as last_triggered
      FROM smart_tasks
      WHERE status = 'triggered' AND user_id = $1
      GROUP BY category
    `, [req.auth.userId]);

    categoryChecks.rows.forEach(row => {
      categoryLastTriggered[row.category] = row.last_triggered;
    });

    let batchMap = {};
    let triggeredCategories = []; // Track which categories have triggered in this cycle

    for (let task of tasks.rows) {
      await evaluateAndTriggerTask(task, lat, lng, categoryLastTriggered, triggeredCategories, batchMap);
    }

    // Convert batchMap to batches array with priority sorting within each category
    const batches = Object.keys(batchMap).map(category => {
      // Sort tasks within batch by priority (high → medium → low)
      const priorityOrder = { high: 1, medium: 2, low: 3 };
      const sortedTasks = batchMap[category].sort((a, b) =>
        priorityOrder[a.priority] - priorityOrder[b.priority]
      );

      return {
        category,
        count: sortedTasks.length,
        tasks: sortedTasks.slice(0, 5), // Cap at 5 tasks per batch to prevent overload
      };
    });

    console.log(`✅ Response: ${batches.length} batch(es) with ${batches.reduce((sum, b) => sum + b.count, 0)} total tasks\n`);
    res.json({ batches });
  } catch (err) {
    console.error("❌ Trigger error:", err);
    res.status(500).json({ error: "Trigger engine failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

// For local development, you can use:
// app.listen(PORT, () => {
//   console.log("Server running on port", PORT);
// });