"use strict";
const crypto = require("crypto");
const { audit } = require("./db");
const SESSION_MS = 12 * 3600 * 1000, MAX_FAIL = 5, LOCK_MS = 15 * 60 * 1000;
const sha = s => crypto.createHash("sha256").update(s).digest("hex");

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return "scrypt$" + salt.toString("hex") + "$" + h.toString("hex");
}
function checkPassword(pw, stored) {
  const [alg, salt, hash] = String(stored).split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const h = crypto.scryptSync(pw, Buffer.from(salt, "hex"), 64, { N: 16384, r: 8, p: 1 }), e = Buffer.from(hash, "hex");
  return h.length === e.length && crypto.timingSafeEqual(h, e);
}
const DUMMY = hashPassword("dummy-password-for-timing");
const emailOk = e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 254;

function createOrUpdateAdmin(db, email, password) {
  email = String(email || "").trim().toLowerCase();
  if (!emailOk(email)) throw new Error("Adresse e-mail administrateur invalide");
  if (String(password || "").length < 10) throw new Error("Le mot de passe doit contenir au moins 10 caractères");
  const ph = hashPassword(password), ex = db.prepare("SELECT id FROM users WHERE email=?").get(email);
  if (ex) { db.prepare("UPDATE users SET password_hash=?, failed_logins=0, locked_until=NULL WHERE id=?").run(ph, ex.id); return { id: ex.id, created: false }; }
  const r = db.prepare("INSERT INTO users(email, password_hash, role, created_at) VALUES(?, ?, 'admin', ?)").run(email, ph, Date.now());
  return { id: Number(r.lastInsertRowid), created: true };
}
function login(db, email, password) {
  email = String(email || "").trim().toLowerCase(); password = String(password || "");
  const u = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if (u && u.locked_until && u.locked_until > Date.now()) { checkPassword(password, DUMMY); return { code: 423, error: "Compte temporairement verrouillé après plusieurs échecs. Réessayez dans quelques minutes." }; }
  const ok = u ? checkPassword(password, u.password_hash) : (checkPassword(password, DUMMY), false);
  if (!ok) {
    if (u) {
      const n = u.failed_logins + 1;
      db.prepare("UPDATE users SET failed_logins=?, locked_until=? WHERE id=?").run(n >= MAX_FAIL ? 0 : n, n >= MAX_FAIL ? Date.now() + LOCK_MS : null, u.id);
      audit(db, u.id, "login_failed", { n });
    }
    return { code: 401, error: "Identifiants invalides" };
  }
  const token = crypto.randomBytes(32).toString("hex"), now = Date.now();
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
  db.prepare("INSERT INTO sessions(token_hash, user_id, created_at, expires_at) VALUES(?, ?, ?, ?)").run(sha(token), u.id, now, now + SESSION_MS);
  db.prepare("UPDATE users SET failed_logins=0, locked_until=NULL, last_login=? WHERE id=?").run(now, u.id);
  audit(db, u.id, "login", {});
  return { token, expires_at: now + SESSION_MS, user: { id: u.id, email: u.email, role: u.role } };
}
function fromRequest(db, req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return null;
  const t = h.slice(7).trim(); if (!/^[a-f0-9]{64}$/.test(t)) return null;
  const r = db.prepare("SELECT u.id, u.email, u.role, s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?").get(sha(t));
  return r && r.expires_at > Date.now() ? { id: r.id, email: r.email, role: r.role, tokenHash: sha(t) } : null;
}
const logout = (db, user) => db.prepare("DELETE FROM sessions WHERE token_hash=?").run(user.tokenHash);
module.exports = { createOrUpdateAdmin, login, fromRequest, logout, checkPassword, hashPassword, emailOk };
