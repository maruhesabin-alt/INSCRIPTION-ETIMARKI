"use strict";
// Tâches longues (analyse des sources, import) exécutées en arrière-plan avec suivi de progression.
const crypto = require("crypto");
const { tx } = require("./db");
const S = require("./sources");
const { validate, dedupeKey, rowToDef } = require("./validate");
const cancelled = new Set();

const upd = (db, id, f) => { const k = Object.keys(f); db.prepare(`UPDATE jobs SET ${k.map(x => x + "=?").join(",")} WHERE id=?`).run(...k.map(x => f[x]), id); };
const slog = (db, o) => db.prepare("INSERT INTO sync_logs(at,kind,source_id,job_id,activity_id,status,fetched,inserted,duplicates,rejected,message) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
  .run(Date.now(), o.kind, o.source_id || null, o.job_id || null, o.activity_id || null, o.status, o.fetched || 0, o.inserted || 0, o.duplicates || 0, o.rejected || 0, String(o.message || "").slice(0, 500));

function start(db, type, userId, runner) {
  const id = crypto.randomBytes(8).toString("hex");
  db.prepare("INSERT INTO jobs(id,type,status,progress,created_by,created_at) VALUES(?,?,'pending',0,?,?)").run(id, type, userId || null, Date.now());
  setImmediate(async () => {
    upd(db, id, { status: "running", started_at: Date.now(), message: "Démarrage…" });
    try {
      const result = await runner(id, m => upd(db, id, m));
      if (cancelled.delete(id)) upd(db, id, { status: "cancelled", message: "Annulée", finished_at: Date.now(), result_json: JSON.stringify(result || {}) });
      else upd(db, id, { status: result && result.failed ? "error" : "done", progress: 100, message: (result && result.summary) || "Terminé", result_json: JSON.stringify(result || {}), finished_at: Date.now() });
    } catch (e) { upd(db, id, { status: "error", message: String(e.message || e).slice(0, 300), finished_at: Date.now() }); }
  });
  return id;
}
const cancel = (db, id) => {
  const j = db.prepare("SELECT status FROM jobs WHERE id=?").get(id);
  if (!j || !["pending", "running"].includes(j.status)) return false;
  cancelled.add(id); return true;
};
const isCancelled = id => cancelled.has(id);

function analyze(db, sourceIds) {
  return async (jobId, set) => {
    let srcs = db.prepare("SELECT * FROM sources ORDER BY id").all();
    if (sourceIds && sourceIds.length) srcs = srcs.filter(s => sourceIds.includes(s.id));
    if (!srcs.length) return { failed: true, summary: "Aucune source configurée : ajoutez d'abord une source (URL d'API).", sources: [] };
    const res = []; let ok = 0;
    for (let i = 0; i < srcs.length; i++) {
      if (isCancelled(jobId)) break;
      const s = srcs[i]; set({ progress: Math.round(i / srcs.length * 100), message: `Analyse de « ${s.name} » (${i + 1}/${srcs.length})…` });
      let p;
      try { p = await S.probe(s); } catch (e) { p = { reachable: false, errors: [e.message], endpoints: [], probed_at: Date.now() }; }
      const good = p.reachable && !(p.status === 401 || p.status === 403);
      db.prepare("UPDATE sources SET probe_json=?, probed_at=?, status=? WHERE id=?").run(JSON.stringify(p), p.probed_at, p.reachable ? (good ? "reachable" : "auth") : "error", s.id);
      if (p.reachable) ok++;
      slog(db, { kind: "analyse", source_id: s.id, job_id: jobId, status: p.reachable ? "ok" : "error", message: p.reachable ? `${p.endpoints.length} endpoint(s) découvert(s)${p.errors.length ? " — " + p.errors[0] : ""}` : p.errors[0] });
      res.push({ id: s.id, name: s.name, reachable: p.reachable, status: p.status, endpoints: p.endpoints.length, docs: !!p.docs_url, errors: p.errors });
    }
    return { sources: res, failed: ok === 0, summary: `${ok}/${srcs.length} source(s) joignable(s)` };
  };
}

function importFromSource(db, srcId, hooks) {
  return async (jobId, set) => {
    const src = db.prepare("SELECT * FROM sources WHERE id=?").get(srcId);
    const cfg = src && src.import_json && JSON.parse(src.import_json);
    const fail = m => { slog(db, { kind: "import-api", source_id: srcId, job_id: jobId, status: "error", message: m }); return { failed: true, summary: m }; };
    if (!src || !cfg) return fail("Configuration d'import introuvable");
    if (!src.validated) return fail("La source n'a pas été validée par l'administrateur");
    const arow = db.prepare("SELECT * FROM activities WHERE id=?").get(cfg.activity_id);
    if (!arow) return fail("Activité cible introuvable");
    const def = rowToDef(arow);
    set({ progress: 5, message: "Interrogation de la source…" });
    let items; try { ({ items } = await S.fetchRecords(src, cfg)); } catch (e) { return fail("Récupération échouée : " + e.message); }
    const ins = db.prepare("INSERT INTO submissions(id,activity_id,data_json,dedupe_key,source_id,external_id,import_job,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING");
    let inserted = 0, duplicates = 0, rejected = 0; const errors = [];
    for (let b = 0; b < items.length; b += 200) {
      if (isCancelled(jobId)) break;
      const batch = items.slice(b, b + 200);
      tx(db, () => {
        for (let i = 0; i < batch.length; i++) {
          const data = S.mapRecord(def, cfg, batch[i]), v = validate(def.fields, data);
          if (v.error) { rejected++; if (errors.length < 20) errors.push({ row: b + i + 1, error: v.error }); continue; }
          const r = ins.run(crypto.randomBytes(6).toString("hex"), def.id, JSON.stringify(v.clean), dedupeKey(def, v.clean), srcId, S.externalId(cfg, batch[i], v.clean), jobId, Date.now());
          if (r.changes) inserted++; else duplicates++;
        }
      });
      set({ progress: 10 + Math.round(Math.min(b + 200, items.length) / items.length * 85), message: `Import : ${Math.min(b + 200, items.length)}/${items.length}` });
    }
    const check = db.prepare("SELECT COUNT(*) c FROM submissions WHERE import_job=?").get(jobId).c;
    if (check !== inserted) return fail(`Incohérence détectée : ${inserted} insertion(s) attendue(s), ${check} trouvée(s) en base`);
    const msg = `${inserted} importé(s), ${duplicates} doublon(s) ignoré(s), ${rejected} rejeté(s) sur ${items.length} reçu(s) — vérifié en base`;
    slog(db, { kind: "import-api", source_id: srcId, job_id: jobId, activity_id: def.id, status: "ok", fetched: items.length, inserted, duplicates, rejected, message: msg });
    if (hooks && hooks.audit) hooks.audit("import_api", { source: srcId, inserted, duplicates, rejected });
    return { inserted, duplicates, rejected, fetched: items.length, errors, verified: true, summary: msg };
  };
}
module.exports = { start, cancel, analyze, importFromSource, slog };
