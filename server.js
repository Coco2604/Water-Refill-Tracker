const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Pool } = require("pg");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- Database setup ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS refills (
      id SERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL REFERENCES members(id),
      amount REAL NOT NULL DEFAULT 30,
      created_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes')
    );
  `);

  // Fix any old records that still have amount=31
  await pool.query("UPDATE refills SET amount = 30 WHERE amount = 31");

  // Seed default members if table is empty
  const { rows } = await pool.query("SELECT COUNT(*) as c FROM members");
  if (Number(rows[0].c) === 0) {
    await pool.query("INSERT INTO members (name) VALUES ('Person 1'), ('Person 2'), ('Person 3')");
  }
}

// --- Helper: get dashboard data ---
async function getDashboard() {
  const { rows: members } = await pool.query("SELECT id, name FROM members ORDER BY id");

  const stats = [];
  for (const m of members) {
    const { rows } = await pool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total
       FROM refills WHERE member_id = $1`,
      [m.id]
    );
    stats.push({
      id: m.id,
      name: m.name,
      count: Number(rows[0].count),
      total: Number(rows[0].total),
    });
  }

  const { rows: history } = await pool.query(
    `SELECT r.id, m.name, r.amount, r.created_at
     FROM refills r JOIN members m ON r.member_id = m.id
     ORDER BY r.id DESC LIMIT 50`
  );

  const grandTotal = stats.reduce((s, m) => s + m.total, 0);
  const totalRefills = stats.reduce((s, m) => s + m.count, 0);

  return { members: stats, history, grandTotal, totalRefills };
}

// --- Serve static files ---
app.use(express.static(path.join(__dirname, "public")));

// --- Socket.io ---
io.on("connection", (socket) => {
  // Send current data on connect
  getDashboard().then((data) => socket.emit("dashboard", data));

  // Record a new refill
  socket.on("add-refill", async (data) => {
    try {
      const memberId = Number(data.memberId);
      if (!Number.isInteger(memberId) || memberId < 1) return;

      // Verify member exists
      const { rows } = await pool.query("SELECT id FROM members WHERE id = $1", [memberId]);
      if (rows.length === 0) return;

      await pool.query(
        "INSERT INTO refills (member_id, amount) VALUES ($1, 30)",
        [memberId]
      );
      io.emit("dashboard", await getDashboard());
    } catch (err) {
      console.error("add-refill error:", err);
    }
  });

  // Undo last refill
  socket.on("undo-last", async (data) => {
    try {
      const memberId = Number(data.memberId);
      if (!Number.isInteger(memberId) || memberId < 1) return;

      const { rows } = await pool.query(
        "SELECT id FROM refills WHERE member_id = $1 ORDER BY id DESC LIMIT 1",
        [memberId]
      );
      if (rows.length > 0) {
        await pool.query("DELETE FROM refills WHERE id = $1", [rows[0].id]);
        io.emit("dashboard", await getDashboard());
      }
    } catch (err) {
      console.error("undo-last error:", err);
    }
  });

  // Rename a member
  socket.on("rename-member", async (data) => {
    try {
      const memberId = Number(data.memberId);
      const newName = String(data.name).trim().slice(0, 30);
      if (!Number.isInteger(memberId) || memberId < 1 || !newName) return;

      await pool.query("UPDATE members SET name = $1 WHERE id = $2", [newName, memberId]);
      io.emit("dashboard", await getDashboard());
    } catch (err) {
      console.error("rename-member error:", err);
    }
  });
});

// --- Graceful shutdown ---
function shutdown() {
  pool.end().then(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// --- Start server ---
const PORT = process.env.PORT || 3000;
initDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Bottle Refills tracker running at http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});
