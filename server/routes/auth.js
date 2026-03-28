const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
require("dotenv").config();

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Ensure mobile_users table exists
pool.query(`
  CREATE TABLE IF NOT EXISTS mobile_users (
    id          SERIAL PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(err => console.error("❌ mobile_users table error:", err.message));

const makeToken = (userId) =>
  jwt.sign(
    { userId: String(userId), source: "mobile" },
    process.env.JWT_SECRET || 'SECRET',
    { expiresIn: "30d" }
  );

// POST /auth/register
router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required." });

  if (password.length < 6)
    return res.status(400).json({ error: "Password must be at least 6 characters." });

  try {
    const hashed = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO mobile_users (email, password) VALUES ($1, $2)
       RETURNING id, email, created_at`,
      [email.toLowerCase().trim(), hashed]
    );
    const user = result.rows[0];
    console.log(`✅ Mobile user registered: ${user.email}`);
    res.status(201).json({
      token: makeToken(`mobile_${user.id}`),
      user: { id: user.id, email: user.email },
    });
  } catch (err) {
    if (err.code === "23505") {
      // unique_violation — email already exists
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

// POST /auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required." });

  try {
    const result = await pool.query(
      `SELECT id, email, password FROM mobile_users WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0)
      return res.status(401).json({ error: "Invalid email or password." });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match)
      return res.status(401).json({ error: "Invalid email or password." });

    console.log(`✅ Mobile user logged in: ${user.email}`);
    res.json({
      token: makeToken(`mobile_${user.id}`),
      user: { id: user.id, email: user.email },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

module.exports = router;
