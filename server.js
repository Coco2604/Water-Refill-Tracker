const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- Database setup ---
const db = new Database(path.join(__dirname, "refills.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS refills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    amount REAL NOT NULL DEFAULT 30,
    created_at TEXT NOT NULL DEFAULT (datetime('now','+5 hours','+30 minutes')),
    FOREIGN KEY (member_id) REFERENCES members(id)
  );
`);

// Fix any old records that still have amount=31
db.prepare("UPDATE refills SET amount = 30 WHERE amount = 31").run();

// Seed default members if table is empty
const count = db.prepare("SELECT COUNT(*) as c FROM members").get().c;
if (count === 0) {
  const insert = db.prepare("INSERT INTO members (name) VALUES (?)");
  insert.run("Person 1");
  insert.run("Person 2");
  insert.run("Person 3");
}

// --- Helper: get dashboard data ---
function getDashboard() {
  const members = db.prepare("SELECT id, name FROM members ORDER BY id").all();

  const stats = members.map((m) => {
    const row = db
      .prepare(
        `SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total
         FROM refills WHERE member_id = ?`
      )
      .get(m.id);
    return { id: m.id, name: m.name, count: row.count, total: row.total };
  });

  const history = db
    .prepare(
      `SELECT r.id, m.name, r.amount, r.created_at
       FROM refills r JOIN members m ON r.member_id = m.id
       ORDER BY r.id DESC LIMIT 50`
    )
    .all();

  const grandTotal = stats.reduce((s, m) => s + m.total, 0);
  const totalRefills = stats.reduce((s, m) => s + m.count, 0);

  return { members: stats, history, grandTotal, totalRefills };
}

// --- Serve static files ---
app.use(express.static(path.join(__dirname, "public")));

// --- Socket.io ---
io.on("connection", (socket) => {
  // Send current data on connect
  socket.emit("dashboard", getDashboard());

  // Record a new refill
  socket.on("add-refill", (data) => {
    const memberId = Number(data.memberId);
    if (!Number.isInteger(memberId) || memberId < 1) return;

    // Verify member exists
    const member = db
      .prepare("SELECT id FROM members WHERE id = ?")
      .get(memberId);
    if (!member) return;

    db.prepare("INSERT INTO refills (member_id, amount, created_at) VALUES (?, 30, datetime('now','+5 hours','+30 minutes'))").run(memberId);
    io.emit("dashboard", getDashboard()); // broadcast to ALL clients
  });

  // Undo last refill (optional safety feature)
  socket.on("undo-last", (data) => {
    const memberId = Number(data.memberId);
    if (!Number.isInteger(memberId) || memberId < 1) return;

    const last = db
      .prepare(
        "SELECT id FROM refills WHERE member_id = ? ORDER BY id DESC LIMIT 1"
      )
      .get(memberId);
    if (last) {
      db.prepare("DELETE FROM refills WHERE id = ?").run(last.id);
      io.emit("dashboard", getDashboard());
    }
  });

  // Rename a member
  socket.on("rename-member", (data) => {
    const memberId = Number(data.memberId);
    const newName = String(data.name).trim().slice(0, 30);
    if (!Number.isInteger(memberId) || memberId < 1 || !newName) return;

    db.prepare("UPDATE members SET name = ? WHERE id = ?").run(
      newName,
      memberId
    );
    io.emit("dashboard", getDashboard());
  });
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Bottle Refills tracker running at http://localhost:${PORT}`);
});
