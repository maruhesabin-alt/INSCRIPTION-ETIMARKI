"use strict";
const { DatabaseSync } = require("node:sqlite");
const fs = require("fs"), path = require("path");

function migrate(db, dir) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, at INTEGER NOT NULL)");
  const done = new Set(db.prepare("SELECT name FROM schema_migrations").all().map(r => r.name));
  const files = fs.readdirSync(dir).filter(f => /^\d+.*\.sql$/.test(f)).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    tx(db, () => { db.exec(sql); db.prepare("INSERT INTO schema_migrations(name, at) VALUES(?, ?)").run(f, Date.now()); });
  }
}
function tx(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { try { db.exec("ROLLBACK"); } catch (x) {} throw e; }
}
function open(file, migDir) {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db, migDir);
  return db;
}
const audit = (db, userId, action, details) =>
  db.prepare("INSERT INTO audit_logs(at, user_id, action, details) VALUES(?, ?, ?, ?)").run(Date.now(), userId || null, action, typeof details === "string" ? details : JSON.stringify(details || {}));
module.exports = { open, tx, audit };
