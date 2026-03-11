# 🌸 Bottle Refills Tracker 💧

A real-time shared expense tracker for water bottle refills (₹30 per refill). Built for roommates/flatmates to track who paid and how much everyone owes.

## Features

- **Real-time updates** — all connected devices sync instantly via Socket.io
- **Per-member tracking** — see each person's refill count and total spent
- **Pie chart breakdown** — visual share of contributions
- **Rename members** — click any name to rename
- **Undo support** — revert the last refill per person
- **Refill history** — recent activity log with timestamps
- **Persistent storage** — SQLite database stored locally so data survives restarts

## Tech Stack

- **Backend:** Node.js, Express, Socket.io
- **Database:** SQLite (via better-sqlite3)
- **Frontend:** Vanilla HTML/CSS/JS with Socket.io client

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or later)

### Install & Run

```bash
git clone <your-repo-url>
cd bottleRefills
npm install
npm start
```

Open **http://localhost:3000** in your browser.

### Multiple Devices

Open the same URL on any device connected to the same network (use your local IP, e.g. `http://192.168.x.x:3000`). All devices stay in sync in real-time.

## Database

The SQLite database is stored at:

```
%LOCALAPPDATA%\BottleRefills\refills.db
```

This keeps it outside OneDrive/cloud sync folders to prevent data corruption.

## Project Structure

```
bottleRefills/
├── server.js        # Express + Socket.io server, SQLite setup
├── public/
│   └── index.html   # Frontend (UI + client-side JS)
├── package.json
├── .gitignore
└── README.md
```
