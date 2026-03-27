const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  try {
    console.log("Adding user_id to smart_tasks...");
    await pool.query(`ALTER TABLE smart_tasks ADD COLUMN IF NOT EXISTS user_id TEXT`);
    
    console.log("Adding user_id to places...");
    await pool.query(`ALTER TABLE places ADD COLUMN IF NOT EXISTS user_id TEXT`);
    
    console.log("✅ Migration complete.");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    pool.end();
  }
}

migrate();
