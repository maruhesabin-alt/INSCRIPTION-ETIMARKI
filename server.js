"use strict";
/* COLLECT PRO — serveur (Node.js 22.13+, sans bibliothèque externe).
   Site + API /api/v1 + base SQL + connexion administrateur + analyse des sources en arrière-plan. */
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = __dirname;
require("./env").loadEnv(process.env.ENV_FILE || path.join(ROOT, ".env"));
const PORT = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
const BACKUPS = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(DATA, "backups");
fs.mkdirSync(DATA, { recursive: true });

const D = require("./db"), auth = require("./auth"), cr = require("./crypto"), bk = require("./backup");
const jobs = require("./jobs"), S = require("./sources"), net = require("./net");
const { cleanDef, validate, dedupeKey, rowToDef } = require("./validate");
cr.init(DATA);
const db = D.open(path.join(DATA, "collect-pro.db"), ROOT);
const audit = (u, a, d) => D.audit(db, u && u.id, a, d);

/* --- Reprise des données de l'ancienne version (data/db.json) --- */
(function migrateLegacy() {
  const f = path.join(DATA, "db.json");
  if (!fs.existsSync(f) || db.prepare("SELECT COUNT(*) c FROM activities").get().c) return;
  let old; try { old = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return console.error("db.json illisible, migration ignorée"); }
  let na = 0, ns = 0, nd = 0;
  D.tx(db, () => {
    for (const [id, a] of Object.entries(old.activities || {})) {
      if (!a.def || !/^[a-z0-9]{4,40}$/i.test(id)) continue;
      const now = Date.now();
      db.prepare("INSERT INTO activities(id,name,description,kind,status,fields_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").run(id, a.def.name, a.def.desc || "", a.def.kind || "forms", a.def.status || "active", JSON.stringify(a.def.fields || []), now, now); na++;
      const def = rowToDef(db.prepare("SELECT * FROM activities WHERE id=?").get(id));
      for (const s of a.subs || []) {
        const r = db.prepare("INSERT INTO submissions(id,activity_id,data_json,dedupe_key,created_at) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING").run(String(s.id), id, JSON.stringify(s.data || {}), dedupeKey(def, s.data || {}), s.at || now);
        if (r.changes) ns++; else nd++;
      }
    }
  });
  fs.renameSync(f, f + ".migrated");
  audit(null, "migration_db_json", { activities: na, submissions: ns, duplicates_ignored: nd });
  console.log(`Ancienne base reprise : ${na} activité(s), ${ns} réponse(s), ${nd} doublon(s) ignoré(s).`);
})();

/* --- Compte administrateur initial (depuis .env) --- */
(function bootstrapAdmin() {
  const n = db.prepare("SELECT COUNT(*) c FROM users").get().c;
  if (n) return;
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) return console.warn("\n⚠ Aucun administrateur : créez un fichier .env avec ADMIN_EMAIL et ADMIN_PASSWORD (voir .env.example), puis relancez.\n");
  try { auth.createOrUpdateAdmin(db, process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD); audit(null, "admin_created", {}); console.log("Compte administrateur créé : " + process.env.ADMIN_EMAIL.toLowerCase()); }
  catch (e) { console.error("Administrateur non créé : " + e.message); }
})();
db.prepare("UPDATE jobs SET status='error', message='Interrompue par un redémarrage du serveur', finished_at=? WHERE status IN ('running','pending')").run(Date.now());

/* --- Sauvegardes automatiques --- */
const KEEP = Number(process.env.BACKUP_KEEP) || 14;
function autoBackup() { try { const l = bk.list(BACKUPS); if (!l.length || Date.now() - l[0].at > 24 * 3600 * 1000) { const n = bk.create(db, BACKUPS, KEEP); audit(null, "backup_auto", { name: n }); } } catch (e) { console.error("Sauvegarde automatique échouée :", e.message); } }
if (process.env.BACKUP_AUTO !== "0") { autoBackup(); setInterval(autoBackup, 6 * 3600 * 1000).unref(); }

/* --- Utilitaires HTTP --- */
const MAX_BODY = 2 * 1024 * 1024, MAX_SUBS = 100000;
const ID_RE = /^[a-z0-9]{4,40}$/i;
function send(res, code, obj, extra) {
  const body = JSON.stringify(obj);
  res.writeHead(code, Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS" }, extra));
  res.end(body);
}
const fail = (res, code, msg) => send(res, code, { error: msg });
function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > limit) { reject({ code: 413, msg: "Requête trop volumineuse" }); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch (e) { reject({ code: 400, msg: "JSON invalide" }); } });
    req.on("error", () => reject({ code: 400, msg: "Requête interrompue" }));
  });
}
const hits = new Map();
function limited(key, max, ms) {
  const now = Date.now(), arr = (hits.get(key) || []).filter(t => now - t < ms); arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > ms) hits.delete(k);
  return arr.length > max;
}
const ip = req => req.socket.remoteAddress || "?";
const getAct = id => ID_RE.test(id) ? db.prepare("SELECT * FROM activities WHERE id=?").get(id) : null;
const like = q => "%" + q.replace(/[\\%_]/g, c => "\\" + c) + "%";
const rid = () => crypto.randomBytes(6).toString("hex");
const isUnique = e => /UNIQUE/i.test(String(e && e.message));
const recView = r => ({ id: r.id, at: r.created_at, updated_at: r.updated_at, deleted_at: r.deleted_at, source_id: r.source_id, data: JSON.parse(r.data_json) });
const jobView = j => ({ id: j.id, type: j.type, status: j.status, progress: j.progress, message: j.message, result: j.result_json ? JSON.parse(j.result_json) : null, created_at: j.created_at, started_at: j.started_at, finished_at: j.finished_at });

async function api(req, res, url) {
  const p = url.pathname.replace(/\/+$/, ""), m = req.method; let r;
  if (m === "OPTIONS") return send(res, 204, {});
  const body = async (limit = 256 * 1024) => { try { return await readJson(req, limit); } catch (e) { throw Object.assign(new Error(e.msg), { http: e.code }); } };

  /* ---- Routes publiques ---- */
  if (p === "/api/v1/health" && m === "GET") return send(res, 200, { ok: true, version: "2.0.0", time: new Date().toISOString() });
  if ((r = p.match(/^\/api\/v1\/public\/activities\/([^/]+)$/)) && m === "GET") {
    const a = getAct(r[1]); if (!a || a.status !== "active") return fail(res, 404, "Formulaire introuvable ou fermé");
    const d = rowToDef(a); return send(res, 200, { id: d.id, name: d.name, desc: d.desc, kind: d.kind, fields: d.fields });
  }
  if ((r = p.match(/^\/api\/v1\/public\/activities\/([^/]+)\/submissions$/)) && m === "POST") {
    const a = getAct(r[1]); if (!a || a.status !== "active") return fail(res, 404, "Formulaire introuvable ou fermé");
    if (limited("sub:" + ip(req) + ":" + r[1], 10, 60000)) return fail(res, 429, "Trop d'envois, patientez une minute");
    const b = await body(64 * 1024);
    if (b.website) return fail(res, 400, "Envoi refusé");
    if (db.prepare("SELECT COUNT(*) c FROM submissions WHERE activity_id=?").get(a.id).c >= MAX_SUBS) return fail(res, 507, "Limite de réponses atteinte");
    const def = rowToDef(a), v = validate(def.fields, b.data); if (v.error) return fail(res, 400, v.error);
    const id = rid();
    try { db.prepare("INSERT INTO submissions(id,activity_id,data_json,dedupe_key,created_at) VALUES(?,?,?,?,?)").run(id, a.id, JSON.stringify(v.clean), dedupeKey(def, v.clean), Date.now()); }
    catch (e) { if (isUnique(e)) return fail(res, 409, "Cette réponse existe déjà pour cette activité (même identifiant de contact)"); throw e; }
    return send(res, 201, { ok: true, id });
  }
  if (p === "/api/v1/auth/login" && m === "POST") {
    if (limited("login:" + ip(req), Number(process.env.LOGIN_RATE) || 10, 60000)) return fail(res, 429, "Trop de tentatives, patientez une minute");
    const b = await body(8 * 1024), out = auth.login(db, b.email, b.password);
    return out.error ? fail(res, out.code, out.error) : send(res, 200, out);
  }

  /* ---- Routes protégées ---- */
  if (!p.startsWith("/api/v1/")) return fail(res, 404, "Route inconnue");
  const user = auth.fromRequest(db, req);
  if (!user) return fail(res, 401, "Connexion requise ou session expirée");

  if (p === "/api/v1/auth/me" && m === "GET") return send(res, 200, { user: { id: user.id, email: user.email, role: user.role } });
  if (p === "/api/v1/auth/logout" && m === "POST") { auth.logout(db, user); audit(user, "logout", {}); return send(res, 200, { ok: true }); }

  if (p === "/api/v1/admin/overview" && m === "GET") {
    const c = q => db.prepare(q).get().c;
    const last = db.prepare("SELECT at,status,kind,message FROM sync_logs ORDER BY id DESC LIMIT 1").get();
    let size = 0; try { size = fs.statSync(path.join(DATA, "collect-pro.db")).size; } catch (e) {}
    return send(res, 200, { activities: c("SELECT COUNT(*) c FROM activities"), activities_open: c("SELECT COUNT(*) c FROM activities WHERE status='active'"),
      submissions: c("SELECT COUNT(*) c FROM submissions WHERE deleted_at IS NULL"), deleted: c("SELECT COUNT(*) c FROM submissions WHERE deleted_at IS NOT NULL"),
      sources: c("SELECT COUNT(*) c FROM sources"), jobs_running: c("SELECT COUNT(*) c FROM jobs WHERE status IN ('pending','running')"),
      last_sync: last || null, db_size: size, backups: bk.list(BACKUPS).length, now: Date.now() });
  }
  if (p === "/api/v1/admin/consistency" && m === "GET") {
    const one = q => db.prepare(q).get(), checks = [];
    const add = (name, ok, detail) => checks.push({ name, ok, detail });
    add("Intégrité du fichier de base", one("PRAGMA integrity_check").integrity_check === "ok", "PRAGMA integrity_check");
    const orphans = one("SELECT COUNT(*) c FROM submissions s LEFT JOIN activities a ON a.id=s.activity_id WHERE a.id IS NULL").c;
    add("Aucune réponse orpheline", orphans === 0, orphans + " réponse(s) sans activité");
    const bad = one("SELECT COUNT(*) c FROM submissions WHERE json_valid(data_json)=0").c;
    add("Toutes les réponses sont du JSON valide", bad === 0, bad + " enregistrement(s) invalide(s)");
    const dup = one("SELECT COUNT(*) c FROM (SELECT 1 FROM submissions WHERE dedupe_key IS NOT NULL AND deleted_at IS NULL GROUP BY activity_id, dedupe_key HAVING COUNT(*)>1)").c;
    add("Aucun doublon actif", dup === 0, dup + " groupe(s) en doublon");
    const mism = [];
    for (const j of db.prepare("SELECT id,result_json FROM jobs WHERE type='import' AND status='done'").all()) {
      const res = j.result_json && JSON.parse(j.result_json); if (!res || res.inserted === undefined) continue;
      const n = db.prepare("SELECT COUNT(*) c FROM submissions WHERE import_job=?").get(j.id).c;
      if (n !== res.inserted) mism.push(j.id);
    }
    add("Imports : lignes en base = lignes annoncées", mism.length === 0, mism.length ? "écarts : " + mism.join(", ") : "tous les imports terminés concordent");
    const tot = one("SELECT COUNT(*) c FROM submissions").c, per = db.prepare("SELECT COUNT(*) c FROM submissions GROUP BY activity_id").all().reduce((s, x) => s + x.c, 0);
    add("Total global = somme par activité", tot === per, `${tot} / ${per}`);
    const errs = db.prepare("SELECT COUNT(*) c FROM sync_logs WHERE status='error' AND at > ?").get(Date.now() - 86400000).c;
    add("Aucune erreur de synchronisation (24 h)", errs === 0, errs + " erreur(s)");
    return send(res, 200, { ok: checks.every(c => c.ok), checks, at: Date.now() });
  }

  /* ---- Activités ---- */
  if (p === "/api/v1/activities" && m === "GET") {
    const rows = db.prepare("SELECT a.*, (SELECT COUNT(*) FROM submissions s WHERE s.activity_id=a.id AND s.deleted_at IS NULL) n FROM activities a ORDER BY a.created_at DESC").all();
    return send(res, 200, { items: rows.map(x => Object.assign(rowToDef(x), { count: x.n, updated_at: x.updated_at })) });
  }
  if ((r = p.match(/^\/api\/v1\/activities\/([^/]+)$/)) && m === "PUT") {
    if (!ID_RE.test(r[1])) return fail(res, 400, "Identifiant invalide");
    const c = cleanDef(await body()); if (c.error) return fail(res, 400, c.error);
    const ex = getAct(r[1]), d = c.def, now = Date.now();
    const df = d.dedupe_field === undefined ? (ex ? ex.dedupe_field : null) : d.dedupe_field;
    if (ex) db.prepare("UPDATE activities SET name=?,description=?,kind=?,status=?,fields_json=?,dedupe_field=?,updated_at=? WHERE id=?").run(d.name, d.desc, d.kind, d.status, JSON.stringify(d.fields), df, now, r[1]);
    else db.prepare("INSERT INTO activities(id,name,description,kind,status,fields_json,dedupe_field,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run(r[1], d.name, d.desc, d.kind, d.status, JSON.stringify(d.fields), df, now, now);
    audit(user, ex ? "activity_updated" : "activity_created", { id: r[1], status: d.status });
    return send(res, 200, { ok: true, id: r[1], count: db.prepare("SELECT COUNT(*) c FROM submissions WHERE activity_id=? AND deleted_at IS NULL").get(r[1]).c });
  }
  if ((r = p.match(/^\/api\/v1\/activities\/([^/]+)\/submissions$/)) && m === "GET") {   // compatibilité avec app.html
    if (!getAct(r[1])) return fail(res, 404, "Activité inconnue");
    const since = Number(url.searchParams.get("since")) || 0;
    const rows = db.prepare("SELECT * FROM submissions WHERE activity_id=? AND deleted_at IS NULL AND created_at>? ORDER BY created_at LIMIT 100000").all(r[1], since);
    return send(res, 200, { items: rows.map(x => ({ id: x.id, at: x.created_at, data: JSON.parse(x.data_json) })), total: rows.length });
  }
  if ((r = p.match(/^\/api\/v1\/activities\/([^/]+)\/records$/)) && m === "GET") {
    const a = getAct(r[1]); if (!a) return fail(res, 404, "Activité inconnue");
    const sp = url.searchParams, q = (sp.get("q") || "").trim().toLowerCase().slice(0, 100), per = Math.min(100, Math.max(1, Number(sp.get("per")) || 20)), page = Math.max(1, Number(sp.get("page")) || 1);
    const dir = sp.get("dir") === "asc" ? "ASC" : "DESC", del = sp.get("deleted") === "1" ? "IS NOT NULL" : "IS NULL";
    const where = `activity_id=? AND deleted_at ${del}` + (q ? " AND lower(data_json) LIKE ? ESCAPE '\\'" : ""), args = q ? [a.id, like(q)] : [a.id];
    const total = db.prepare(`SELECT COUNT(*) c FROM submissions WHERE ${where}`).get(...args).c;
    const rows = db.prepare(`SELECT * FROM submissions WHERE ${where} ORDER BY created_at ${dir}, id LIMIT ? OFFSET ?`).all(...args, per, (page - 1) * per);
    return send(res, 200, { items: rows.map(recView), total, page, per });
  }
  if ((r = p.match(/^\/api\/v1\/activities\/([^/]+)\/export$/)) && m === "GET") {
    const a = getAct(r[1]); if (!a) return fail(res, 404, "Activité inconnue");
    const def = rowToDef(a), rows = db.prepare("SELECT * FROM submissions WHERE activity_id=? AND deleted_at IS NULL ORDER BY created_at").all(a.id).map(recView);
    audit(user, "export", { activity: a.id, rows: rows.length });
    const fmt = url.searchParams.get("format") === "json" ? "json" : "csv", base = "collect-pro-" + a.id;
    if (fmt === "json") return send(res, 200, { activity: { id: a.id, name: def.name }, items: rows }, { "Content-Disposition": `attachment; filename="${base}.json"` });
    const cell = v => { let s = Array.isArray(v) ? v.join(", ") : v === true ? "Oui" : v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const csv = "\ufeff" + [["Reçu le", ...def.fields.map(f => f.label)].map(cell).join(";"), ...rows.map(x => [new Date(x.at).toISOString(), ...def.fields.map(f => x.data[f.key])].map(cell).join(";"))].join("\n");
    res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"`, "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
    return res.end(csv);
  }
  if ((r = p.match(/^\/api\/v1\/activities\/([^/]+)\/import$/)) && m === "POST") {
    const a = getAct(r[1]); if (!a) return fail(res, 404, "Activité inconnue");
    const b = await body(MAX_BODY); if (!Array.isArray(b.items) || b.items.length > 5000) return fail(res, 400, "« items » doit être une liste de 5000 éléments maximum");
    const def = rowToDef(a), ins = db.prepare("INSERT INTO submissions(id,activity_id,data_json,dedupe_key,created_at) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING");
    let inserted = 0, duplicates = 0, rejected = 0; const errors = [];
    D.tx(db, () => b.items.forEach((it, i) => {
      const v = validate(def.fields, it);
      if (v.error) { rejected++; if (errors.length < 20) errors.push({ row: i + 1, error: v.error }); return; }
      const k = dedupeKey(def, v.clean);
      // sans clé de doublon, un enregistrement strictement identique à un existant est considéré comme doublon
      if (k === null && db.prepare("SELECT 1 FROM submissions WHERE activity_id=? AND deleted_at IS NULL AND data_json=? LIMIT 1").get(a.id, JSON.stringify(v.clean))) { duplicates++; return; }
      const x = ins.run(rid(), a.id, JSON.stringify(v.clean), k, Date.now()); if (x.changes) inserted++; else duplicates++;
    }));
    const msg = `${inserted} importé(s), ${duplicates} doublon(s), ${rejected} rejeté(s) sur ${b.items.length}`;
    jobs.slog(db, { kind: "import-fichier", activity_id: a.id, status: "ok", fetched: b.items.length, inserted, duplicates, rejected, message: msg });
    audit(user, "import_file", { activity: a.id, inserted, duplicates, rejected });
    return send(res, 200, { inserted, duplicates, rejected, errors, message: msg });
  }

  /* ---- Enregistrements ---- */
  if ((r = p.match(/^\/api\/v1\/records\/([a-f0-9]{4,40})(\/restore)?$/))) {
    const row = db.prepare("SELECT * FROM submissions WHERE id=?").get(r[1]); if (!row) return fail(res, 404, "Enregistrement introuvable");
    const def = rowToDef(getAct(row.activity_id));
    if (m === "GET" && !r[2]) return send(res, 200, recView(row));
    if (m === "PATCH" && !r[2]) {
      const b = await body(), v = validate(def.fields, b.data); if (v.error) return fail(res, 400, v.error);
      try { db.prepare("UPDATE submissions SET data_json=?, dedupe_key=?, updated_at=? WHERE id=?").run(JSON.stringify(v.clean), dedupeKey(def, v.clean), Date.now(), row.id); }
      catch (e) { if (isUnique(e)) return fail(res, 409, "Une autre inscription porte déjà cet identifiant de contact"); throw e; }
      audit(user, "record_updated", { id: row.id, activity: row.activity_id }); return send(res, 200, { ok: true });
    }
    if (m === "DELETE" && !r[2]) { db.prepare("UPDATE submissions SET deleted_at=? WHERE id=?").run(Date.now(), row.id); audit(user, "record_deleted", { id: row.id, activity: row.activity_id }); return send(res, 200, { ok: true }); }
    if (m === "POST" && r[2]) {
      try { db.prepare("UPDATE submissions SET deleted_at=NULL WHERE id=?").run(row.id); } catch (e) { if (isUnique(e)) return fail(res, 409, "Restauration impossible : un doublon actif existe"); throw e; }
      audit(user, "record_restored", { id: row.id, activity: row.activity_id }); return send(res, 200, { ok: true });
    }
  }

  /* ---- Sources externes ---- */
  const srcRow = id => db.prepare("SELECT * FROM sources WHERE id=?").get(id);
  if (p === "/api/v1/sources" && m === "GET") return send(res, 200, { items: db.prepare("SELECT * FROM sources ORDER BY id").all().map(S.publicView) });
  if (p === "/api/v1/sources" && m === "POST") {
    const b = await body(8 * 1024), name = String(b.name || "").trim().slice(0, 100), base = String(b.base_url || "").trim().slice(0, 500);
    const at = ["none", "bearer", "header", "query"].includes(b.auth_type) ? b.auth_type : "none";
    if (!name || !base) return fail(res, 400, "Nom et URL sont obligatoires");
    if ((at === "header" || at === "query") && !/^[\w-]{1,60}$/.test(String(b.auth_name || ""))) return fail(res, 400, "Nom de l'en-tête ou du paramètre invalide");
    try { await net.assertAllowed(base); } catch (e) { return fail(res, 400, e.message); }
    const x = db.prepare("INSERT INTO sources(name,base_url,auth_type,auth_name,secret_enc,created_at) VALUES(?,?,?,?,?,?)").run(name, base, at, at === "header" || at === "query" ? b.auth_name : null, at !== "none" && b.secret ? cr.enc(b.secret) : null, Date.now());
    audit(user, "source_created", { id: Number(x.lastInsertRowid), name }); return send(res, 201, S.publicView(srcRow(Number(x.lastInsertRowid))));
  }
  if ((r = p.match(/^\/api\/v1\/sources\/(\d+)(?:\/(validate|import-config|preview))?$/))) {
    const id = Number(r[1]), s = srcRow(id); if (!s) return fail(res, 404, "Source introuvable");
    if (!r[2] && m === "PUT") {
      const b = await body(8 * 1024), name = String(b.name || s.name).trim().slice(0, 100), base = String(b.base_url || s.base_url).trim().slice(0, 500);
      const at = ["none", "bearer", "header", "query"].includes(b.auth_type) ? b.auth_type : s.auth_type;
      try { await net.assertAllowed(base); } catch (e) { return fail(res, 400, e.message); }
      let sec = s.secret_enc; if (b.clear_secret || at === "none") sec = null; else if (b.secret) sec = cr.enc(b.secret);
      db.prepare("UPDATE sources SET name=?,base_url=?,auth_type=?,auth_name=?,secret_enc=?,validated=0,status='configured' WHERE id=?").run(name, base, at, at === "header" || at === "query" ? (b.auth_name || s.auth_name) : null, sec, id);
      audit(user, "source_updated", { id }); return send(res, 200, S.publicView(srcRow(id)));
    }
    if (!r[2] && m === "DELETE") {
      if (db.prepare("SELECT COUNT(*) c FROM submissions WHERE source_id=?").get(id).c) return fail(res, 409, "Cette source a fourni des données : elle ne peut pas être supprimée");
      db.prepare("DELETE FROM sources WHERE id=?").run(id); audit(user, "source_deleted", { id }); return send(res, 200, { ok: true });
    }
    if (r[2] === "import-config" && m === "PUT") {
      const b = await body(16 * 1024), a = getAct(String(b.activity_id || "")); if (!a) return fail(res, 400, "Activité cible introuvable");
      if (!/^\/[^\s]*$/.test(String(b.endpoint || "")) || String(b.endpoint).length > 300) return fail(res, 400, "L'endpoint doit commencer par « / »");
      const keys = new Set(rowToDef(a).fields.map(f => f.key)), mapping = {};
      for (const [k, v] of Object.entries(b.mapping || {})) { if (!keys.has(k)) return fail(res, 400, "Champ inconnu dans la correspondance : " + k); if (String(v).trim()) mapping[k] = String(v).trim().slice(0, 200); }
      if (!Object.keys(mapping).length) return fail(res, 400, "Associez au moins un champ");
      const cfg = { endpoint: b.endpoint, items_path: String(b.items_path || "").slice(0, 100), activity_id: a.id, mapping, external_id_path: String(b.external_id_path || "").slice(0, 100) };
      db.prepare("UPDATE sources SET import_json=?, validated=0 WHERE id=?").run(JSON.stringify(cfg), id); audit(user, "source_import_config", { id, activity: a.id });
      return send(res, 200, S.publicView(srcRow(id)));
    }
    if (r[2] === "preview" && m === "POST") {
      const cfg = s.import_json && JSON.parse(s.import_json); if (!cfg) return fail(res, 400, "Configurez d'abord l'import");
      const a = getAct(cfg.activity_id); if (!a) return fail(res, 400, "Activité cible introuvable");
      const def = rowToDef(a);
      try {
        const { items, attempts } = await S.fetchRecords(s, cfg);
        const sample = items.slice(0, 5).map(it => { const d = S.mapRecord(def, cfg, it), v = validate(def.fields, d); return { mapped: d, error: v.error || null }; });
        return send(res, 200, { total: items.length, attempts, sample });
      } catch (e) { return fail(res, 502, e.message); }
    }
    if (r[2] === "validate" && m === "POST") {
      const b = await body(1024); if (b.validated && !s.import_json) return fail(res, 400, "Configurez l'import avant de valider la source");
      db.prepare("UPDATE sources SET validated=? WHERE id=?").run(b.validated ? 1 : 0, id); audit(user, b.validated ? "source_validated" : "source_unvalidated", { id });
      return send(res, 200, S.publicView(srcRow(id)));
    }
  }

  /* ---- Tâches de fond ---- */
  if (p === "/api/v1/jobs/analyze" && m === "POST") {
    const b = await body(4 * 1024), ids = Array.isArray(b.sourceIds) ? b.sourceIds.map(Number).filter(Number.isInteger) : [];
    if (db.prepare("SELECT COUNT(*) c FROM jobs WHERE type='analyze' AND status IN ('pending','running')").get().c) return fail(res, 409, "Une analyse est déjà en cours");
    const id = jobs.start(db, "analyze", user.id, jobs.analyze(db, ids)); audit(user, "job_analyze", { job: id });
    return send(res, 202, { id });
  }
  if (p === "/api/v1/jobs/import" && m === "POST") {
    const b = await body(1024), s = srcRow(Number(b.sourceId)); if (!s) return fail(res, 404, "Source introuvable");
    if (!s.import_json) return fail(res, 400, "Configurez l'import de cette source d'abord"); if (!s.validated) return fail(res, 400, "Validez la source avant de lancer l'import");
    if (db.prepare("SELECT COUNT(*) c FROM jobs WHERE type='import' AND status IN ('pending','running')").get().c) return fail(res, 409, "Un import est déjà en cours");
    const id = jobs.start(db, "import", user.id, jobs.importFromSource(db, s.id, { audit: (a, d) => audit(user, a, d) })); audit(user, "job_import", { job: id, source: s.id });
    return send(res, 202, { id });
  }
  if (p === "/api/v1/jobs" && m === "GET") return send(res, 200, { items: db.prepare("SELECT * FROM jobs ORDER BY created_at DESC, rowid DESC LIMIT 30").all().map(jobView) });
  if ((r = p.match(/^\/api\/v1\/jobs\/([a-f0-9]{16})(\/cancel)?$/))) {
    const j = db.prepare("SELECT * FROM jobs WHERE id=?").get(r[1]); if (!j) return fail(res, 404, "Tâche introuvable");
    if (m === "GET" && !r[2]) return send(res, 200, jobView(j));
    if (m === "POST" && r[2]) return jobs.cancel(db, r[1]) ? send(res, 200, { ok: true }) : fail(res, 409, "Cette tâche n'est plus en cours");
  }

  /* ---- Journaux ---- */
  if (p === "/api/v1/logs/audit" && m === "GET") return send(res, 200, { items: db.prepare("SELECT l.id,l.at,l.action,l.details,u.email FROM audit_logs l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.id DESC LIMIT ?").all(Math.min(500, Number(url.searchParams.get("limit")) || 100)) });
  if (p === "/api/v1/logs/sync" && m === "GET") return send(res, 200, { items: db.prepare("SELECT l.*, s.name source_name FROM sync_logs l LEFT JOIN sources s ON s.id=l.source_id ORDER BY l.id DESC LIMIT ?").all(Math.min(500, Number(url.searchParams.get("limit")) || 100)) });

  /* ---- Sauvegardes ---- */
  if (p === "/api/v1/backups" && m === "GET") return send(res, 200, { items: bk.list(BACKUPS) });
  if (p === "/api/v1/backups" && m === "POST") { const name = bk.create(db, BACKUPS, KEEP); audit(user, "backup_created", { name }); return send(res, 201, { name }); }
  if ((r = p.match(/^\/api\/v1\/backups\/(collect-pro-[\w-]+\.db)$/)) && m === "GET") {
    const f = path.join(BACKUPS, r[1]); if (!fs.existsSync(f)) return fail(res, 404, "Sauvegarde introuvable");
    audit(user, "backup_downloaded", { name: r[1] });
    res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${r[1]}"`, "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
    return fs.createReadStream(f).pipe(res);
  }
  return fail(res, 404, "Route inconnue");
}

/* ---- Fichiers statiques ---- */
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2" };
// Fichiers publics servis au navigateur (liste fermée : le code serveur, .env et data/ ne sont jamais servis)
const PAGES = new Set(["index.html", "app.html", "form.html", "admin.html", "style.css", "app.css", "landing.css", "app.js", "admin.js", "form.js", "landing.js"]);
function serve(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") return fail(res, 405, "Méthode non autorisée");
  let rel; try { rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html"; } catch (e) { return fail(res, 400, "URL invalide"); }
  const parts = rel.split("/");
  if (rel.includes("\0") || parts.includes("..") || !(parts.length === 1 && PAGES.has(rel))) return fail(res, 404, "Introuvable");
  const file = path.join(ROOT, rel);
  fs.readFile(file, (err, buf) => {
    if (err) return fail(res, 404, "Introuvable");
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin", "X-Frame-Options": "SAMEORIGIN" });
    res.end(req.method === "HEAD" ? undefined : buf);
  });
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) api(req, res, url).catch(e => { if (e && e.http) return fail(res, e.http, e.message); console.error(e); if (!res.headersSent) fail(res, 500, "Erreur interne"); });
  else serve(req, res, url);
});
server.listen(PORT, () => {
  const port = server.address().port;
  console.log(`\nCOLLECT PRO démarré : http://localhost:${port}`);
  console.log(`Administration      : http://localhost:${port}/admin.html`);
  console.log(`Base de données     : ${path.join(DATA, "collect-pro.db")}\n`);
  if (process.env.READY_FILE) fs.writeFileSync(process.env.READY_FILE, String(port));
});
