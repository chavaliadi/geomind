const express = require("express");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
app.use(express.json());

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
app.get("/api/tasks", async (req, res) => {
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
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching tasks:", err);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

app.post("/tasks", async (req, res) => {
  const { text, priority } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Text is required" });
  }

  // Validate priority if provided
  const validPriorities = ["high", "medium", "low"];
  const finalPriority = priority && validPriorities.includes(priority) ? priority : "medium";

  let category = "general";
  const t = text.toLowerCase();
  if (t.includes("shirt") || t.includes("clothes") || t.includes("dress"))
    category = "clothing";
  else if (t.includes("apple") || t.includes("milk") || t.includes("fruit"))
    category = "grocery";
  else if (t.includes("medicine") || t.includes("tablet"))
    category = "pharmacy";

  try {
    const result = await pool.query(
      `INSERT INTO smart_tasks (raw_text, category, priority)
       VALUES ($1, $2, $3)
       RETURNING id, raw_text as text, category, priority, status, triggered_at, created_at, cooldown_minutes`,
      [text, category, finalPriority]
    );
    console.log(`✅ Task created: "${text}" (${finalPriority} priority)`);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// DELETE /api/tasks/:id - Delete a task
app.delete("/api/tasks/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `DELETE FROM smart_tasks WHERE id = $1 RETURNING id`,
      [id]
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

app.get("/nearby", async (req, res) => {
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
        ROUND(
          ST_Distance(
            geom,
            ST_GeogFromText('POINT(' || $1 || ' ' || $2 || ')')
          )
        ) AS distance
      FROM places
      WHERE category = $3
      AND ST_DWithin(
        geom,
        ST_GeogFromText('POINT(' || $1 || ' ' || $2 || ')'),
        5000
      )
      ORDER BY distance ASC
      `,
      [lng, lat, category]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Geo query error:", err);
    res.status(500).json({ error: "Geo query failed" });
  }
});

app.post("/location", async (req, res) => {
  const { lat, lng } = req.body;

  if (!lat || !lng) {
    return res.status(400).json({ error: "lat and lng required" });
  }

  console.log(`\n📍 Location received: ${lat}, ${lng}`);

  try {
    const tasks = await pool.query(`
    SELECT id, category, cooldown_minutes, triggered_at, priority, raw_text
    FROM smart_tasks
    WHERE status = 'pending'
    ORDER BY 
      CASE priority
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
        ELSE 4
      END ASC,
      created_at DESC
    `);

    console.log(`📋 Found ${tasks.rows.length} pending tasks`);

    // Phase 3C-C: Get category-level cooldown info (30 min default)
    const CATEGORY_COOLDOWN_MINUTES = 30;
    const categoryLastTriggered = {};

    const categoryChecks = await pool.query(`
      SELECT 
        category, 
        MAX(triggered_at) as last_triggered
      FROM smart_tasks
      WHERE status = 'triggered'
      GROUP BY category
    `);

    categoryChecks.rows.forEach(row => {
      categoryLastTriggered[row.category] = row.last_triggered;
    });

    let batchMap = {};
    let triggeredCategories = []; // Track which categories have triggered in this cycle

    for (let task of tasks.rows) {
      console.log(`  Checking task ${task.id} (${task.category}, ${task.priority} priority)...`);

      // Phase 3C-C: Skip if category already triggered in this cycle
      if (triggeredCategories.includes(task.category)) {
        console.log(`    ⏸️ Category '${task.category}' already triggered this cycle (batching)`);
        continue;
      }

      // Phase 3C-C: Skip if category in cooldown (30 min per category)
      if (categoryLastTriggered[task.category]) {
        const diff = (Date.now() - new Date(categoryLastTriggered[task.category])) / 60000;
        if (diff < CATEGORY_COOLDOWN_MINUTES) {
          console.log(`    ⏸️ Category '${task.category}' in cooldown (${diff.toFixed(1)}min < ${CATEGORY_COOLDOWN_MINUTES}min)`);
          continue;
        }
      }

      // ⏳ Per-task cooldown check
      if (task.triggered_at) {
        const diff = (Date.now() - new Date(task.triggered_at)) / 60000;
        console.log(`    Cooldown check: ${diff.toFixed(1)}min < ${task.cooldown_minutes}min? ${diff < task.cooldown_minutes}`);
        if (diff < task.cooldown_minutes) {
          console.log(`    ⏳ Skipped (in cooldown)`);
          continue;
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

        // Mark this category as triggered in this cycle
        triggeredCategories.push(task.category);

        // Group by category for batching
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