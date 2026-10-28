"use strict";
// Lancer : node --test    (aucune installation nécessaire ; Node 22.13+)
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { spawn, execFileSync } = require("node:child_process");
const http = require("node:http");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const ROOT = __dirname;
const PW = "Mot#de#passe-2026";                       // contient des # pour vérifier la lecture de .env
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = [], dirs = [];
const mk = p => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); dirs.push(d); return d; };

async function startServer(env = {}, dir = mk("cp-")) {
  const ready = path.join(dir, "ready"); fs.rmSync(ready, { force: true });
  const proc = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", path.join(ROOT, "server.js")], {
    env: { ...process.env, PORT: "0", DATA_DIR: dir, READY_FILE: ready, BACKUP_AUTO: "0", LOGIN_RATE: "100", ...env }, stdio: "ignore" });
  procs.push(proc);
  for (let i = 0; i < 200 && !fs.existsSync(ready); i++) await sleep(50);
  assert.ok(fs.existsSync(ready), "le serveur n'a pas démarré");
  return { base: "http://127.0.0.1:" + fs.readFileSync(ready, "utf8"), dir, proc };
}
let S, TOKEN, ENVDIR;
const J = async (u, o = {}, base = S.base) => { const r = await fetch(base + u, o); return { s: r.status, j: await r.json().catch(() => ({})), r }; };
const AH = () => ({ Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" });
const adm = (u, method = "GET", body, base = S.base, token = TOKEN) => J(u, { method, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }, base);
const pub = (id, data, extra = {}) => J(`/api/v1/public/activities/${id}/submissions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data, ...extra }) });
const def = (name, extra) => ({ name, desc: "d", kind: "forms", status: "active", fields: [
  { key: "nom", label: "Nom", type: "text", required: true }, { key: "email", label: "E-mail", type: "email", required: true },
  { key: "niveau", label: "Niveau", type: "radio", required: false, options: ["A", "B"] }], ...extra });
async function waitJob(id, ms = 15000) {
  const t = Date.now();
  for (;;) { const j = (await adm("/api/v1/jobs/" + id)).j; if (["done", "error", "cancelled"].includes(j.status)) return j; assert.ok(Date.now() - t < ms, "tâche trop longue"); await sleep(100); }
}

/* --- API externe factice, pour tester l'analyse et l'import pour de vrai --- */
let mock, MOCK, flakyCount = 0;
function startMock() {
  return new Promise(res => {
    mock = http.createServer((req, rs) => {
      const send = (c, o) => { rs.writeHead(c, { "Content-Type": "application/json" }); rs.end(JSON.stringify(o)); };
      if (req.headers.authorization !== "Bearer goodkey") return send(401, { error: "clé requise" });
      if (req.url === "/") return send(200, { name: "mock" });
      if (req.url === "/openapi.json") return send(200, { openapi: "3.0.0", info: { title: "Mock People API", version: "1.2" }, servers: [{ url: "/" }],
        components: { securitySchemes: { key: { type: "http", scheme: "bearer" } } },
        paths: { "/people": { get: { summary: "Liste des personnes" } }, "/flaky": { get: { summary: "Instable" } }, "/x": { post: {} } } });
      if (req.url === "/people") return send(200, { data: [
        { id: 1, full_name: "Alice", mail: "alice@mock.cd", city: "Goma" }, { id: 2, full_name: "Bob", mail: "bob@mock.cd", city: "Bukavu" }, { id: 3, full_name: "Mauvais", mail: "pas-un-mail" }] });
      if (req.url === "/flaky") { flakyCount++; return flakyCount === 1 ? send(500, { error: "panne" }) : send(200, { items: [{ id: 9, n: "Zed", m: "zed@mock.cd" }] }); }
      send(404, { error: "inconnu" });
    }).listen(0, "127.0.0.1", () => { MOCK = "http://127.0.0.1:" + mock.address().port; res(); });
  });
}
const closedPort = () => new Promise(r => { const s = http.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });

before(async () => {
  await startMock();
  ENVDIR = mk("cp-env-");
  const envFile = path.join(ENVDIR, ".env");
  fs.writeFileSync(envFile, "\uFEFF# commentaire\nADMIN_EMAIL=Admin@Test.cd\nADMIN_PASSWORD=" + PW + "\n");   // BOM Windows + # dans la valeur
  S = await startServer({ ENV_FILE: envFile, ALLOW_PRIVATE_SOURCES: "1", SECRET_KEY: "cle-de-test" });
});
after(() => { procs.forEach(p => p.kill()); mock && mock.close(); dirs.forEach(d => fs.rmSync(d, { recursive: true, force: true })); });

/* ===== Accès et authentification ===== */
test("santé du serveur", async () => { const r = await J("/api/v1/health"); assert.strictEqual(r.s, 200); assert.strictEqual(r.j.ok, true); });
test("routes d'administration refusées sans session", async () => {
  for (const [m, u] of [["GET", "/api/v1/activities"], ["GET", "/api/v1/admin/overview"], ["PUT", "/api/v1/activities/abcd1"], ["GET", "/api/v1/sources"], ["POST", "/api/v1/jobs/analyze"], ["GET", "/api/v1/logs/audit"], ["POST", "/api/v1/backups"], ["GET", "/api/v1/activities/abcd1/records"]])
    assert.strictEqual((await J(u, { method: m })).s, 401, m + " " + u);
  assert.strictEqual((await J("/api/v1/admin/overview", { headers: { Authorization: "Bearer " + "0".repeat(64) } })).s, 401);
  assert.strictEqual((await J("/api/v1/admin/overview", { headers: { Authorization: "Bearer n'importe quoi" } })).s, 401);
});
test("connexion : mauvais mot de passe refusé, bon mot de passe (lu depuis .env avec # et BOM) accepté", async () => {
  assert.strictEqual((await J("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@test.cd", password: "faux" }) })).s, 401);
  assert.strictEqual((await J("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: "inconnu@test.cd", password: PW }) })).s, 401);
  const r = await J("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@test.cd", password: PW }) });
  assert.strictEqual(r.s, 200); assert.match(r.j.token, /^[a-f0-9]{64}$/); TOKEN = r.j.token;
  assert.strictEqual((await adm("/api/v1/auth/me")).j.user.email, "admin@test.cd");
});
test("le mot de passe est stocké haché (scrypt) et la session n'est pas stockée en clair", () => {
  const db = new DatabaseSync(path.join(S.dir, "collect-pro.db"), { readOnly: true });
  const u = db.prepare("SELECT password_hash FROM users").get(), s = db.prepare("SELECT token_hash FROM sessions").get();
  db.close();
  assert.ok(u.password_hash.startsWith("scrypt$")); assert.ok(!u.password_hash.includes(PW)); assert.notStrictEqual(s.token_hash, TOKEN);
});
test("verrouillage après 5 échecs", async () => {
  execFileSync(process.execPath, ["--disable-warning=ExperimentalWarning", path.join(ROOT, "create-admin.js")], { env: { ...process.env, DATA_DIR: S.dir, ENV_FILE: path.join(ENVDIR, "none"), ADMIN_EMAIL: "second@test.cd", ADMIN_PASSWORD: "autre-mot-de-passe-long" }, stdio: "pipe" });
  const bad = () => J("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: "second@test.cd", password: "faux" }) });
  for (let i = 0; i < 5; i++) assert.strictEqual((await bad()).s, 401);
  assert.strictEqual((await bad()).s, 423);
  assert.strictEqual((await J("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: "second@test.cd", password: "autre-mot-de-passe-long" }) })).s, 423, "même le bon mot de passe est refusé pendant le verrouillage");
});
test("limitation de débit sur la connexion", async () => {
  const x = await startServer({ LOGIN_RATE: "3", ADMIN_EMAIL: "a@b.cd", ADMIN_PASSWORD: "mot-de-passe-long-1" });
  const codes = []; for (let i = 0; i < 5; i++) codes.push((await J("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: "a@b.cd", password: "x" }) }, x.base)).s);
  assert.ok(codes.includes(429)); x.proc.kill();
});
test("sans identifiants dans .env, aucun administrateur n'est créé", async () => {
  const x = await startServer({ ADMIN_EMAIL: "", ADMIN_PASSWORD: "", ENV_FILE: path.join(ENVDIR, "none") });
  assert.strictEqual((await J("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: "", password: "" }) }, x.base)).s, 401); x.proc.kill();
});

/* ===== Activités, formulaires publics, données ===== */
let A = "actA1", B = "actB2", firstRec;
test("publication, validation et formulaire public", async () => {
  assert.strictEqual((await adm("/api/v1/activities/abcd1", "PUT", { name: "", fields: [] })).s, 400);
  assert.strictEqual((await adm("/api/v1/activities/abcd1", "PUT", { name: "x", fields: [{ key: "A B", label: "l", type: "text" }] })).s, 400);
  assert.strictEqual((await J("/api/v1/public/activities/" + A)).s, 404, "non publiée = introuvable");
  assert.strictEqual((await adm("/api/v1/activities/" + A, "PUT", def("Activité A"))).s, 200);
  assert.strictEqual((await J("/api/v1/public/activities/" + A)).j.fields.length, 3);
  const ok = await pub(A, { nom: "Aline", email: "Aline@B.cd", niveau: "A" }); assert.strictEqual(ok.s, 201); firstRec = ok.j.id;
  assert.strictEqual((await pub(A, { email: "x@y.cd" })).s, 400);
  assert.strictEqual((await pub(A, { nom: "X", email: "pas-un-email" })).s, 400);
  assert.strictEqual((await pub(A, { nom: "X", email: "x@y.cd", niveau: "Z" })).s, 400);
  assert.strictEqual((await pub(A, { nom: "Bot", email: "bot@y.cd" }, { website: "http://spam" })).s, 400);
  assert.strictEqual((await J("/api/v1/public/activities/" + A + "/submissions", { method: "POST", body: "{pas json" })).s, 400);
});
test("détection des doublons (même e-mail, casse ignorée)", async () => {
  const r = await pub(A, { nom: "Aline bis", email: "aline@b.cd" }); assert.strictEqual(r.s, 409);
  assert.strictEqual((await adm(`/api/v1/activities/${A}/records`)).j.total, 1);
});
test("liste paginée, recherche, et résistance à l'injection SQL", async () => {
  const imp = await adm(`/api/v1/activities/${A}/import`, "POST", { items: Array.from({ length: 24 }, (_, i) => ({ nom: "Personne " + i, email: `p${i}@t.cd` })) });
  assert.strictEqual(imp.j.inserted, 24);
  const l = await adm(`/api/v1/activities/${A}/records?per=10&page=3`); assert.strictEqual(l.j.total, 25); assert.strictEqual(l.j.items.length, 5);
  assert.strictEqual((await adm(`/api/v1/activities/${A}/records?q=personne%2023`)).j.total, 1);
  assert.strictEqual((await adm(`/api/v1/activities/${A}/records?q=${encodeURIComponent("' OR 1=1 --")}`)).j.total, 0);
  assert.strictEqual((await adm(`/api/v1/activities/${A}/records?q=${encodeURIComponent("%")}`)).j.total, 0, "le joker % est neutralisé");
  assert.strictEqual((await adm(`/api/v1/activities/${A}/records?q=${encodeURIComponent("x'; DROP TABLE submissions; --")}`)).s, 200);
  assert.strictEqual((await adm(`/api/v1/activities/${A}/records`)).j.total, 25, "les données sont intactes");
});
test("modification, suppression douce, restauration", async () => {
  assert.strictEqual((await adm("/api/v1/records/" + firstRec, "PATCH", { data: { nom: "", email: "a@b.cd" } })).s, 400);
  assert.strictEqual((await adm("/api/v1/records/" + firstRec, "PATCH", { data: { nom: "Aline M.", email: "aline@b.cd", niveau: "B" } })).s, 200);
  assert.strictEqual((await adm("/api/v1/records/" + firstRec)).j.data.nom, "Aline M.");
  assert.strictEqual((await adm("/api/v1/records/" + firstRec, "PATCH", { data: { nom: "X", email: "p1@t.cd" } })).s, 409, "conflit de doublon");
  assert.strictEqual((await adm("/api/v1/records/" + firstRec, "DELETE")).s, 200);
  assert.strictEqual((await adm(`/api/v1/activities/${A}/records`)).j.total, 24);
  assert.strictEqual((await adm(`/api/v1/activities/${A}/records?deleted=1`)).j.total, 1);
  assert.strictEqual((await pub(A, { nom: "Nouvelle Aline", email: "aline@b.cd" })).s, 201, "l'e-mail d'un enregistrement supprimé est de nouveau libre");
  assert.strictEqual((await adm(`/api/v1/records/${firstRec}/restore`, "POST")).s, 409, "restauration refusée si doublon actif");
  const n = (await adm(`/api/v1/activities/${A}/records?q=nouvelle`)).j.items[0].id;
  await adm("/api/v1/records/" + n, "DELETE");
  assert.strictEqual((await adm(`/api/v1/records/${firstRec}/restore`, "POST")).s, 200);
  assert.strictEqual((await adm("/api/v1/records/zzzz")).s, 404);
});
test("isolation entre activités", async () => {
  await adm("/api/v1/activities/" + B, "PUT", def("Activité B"));
  assert.strictEqual((await pub(B, { nom: "Bob", email: "aline@b.cd" })).s, 201, "même e-mail autorisé dans une autre activité");
  const a = (await adm(`/api/v1/activities/${A}/records?per=100`)).j.items, b = (await adm(`/api/v1/activities/${B}/records`)).j.items;
  assert.ok(a.every(x => x.data.nom !== "Bob")); assert.strictEqual(b.length, 1);
  const rows = (await adm("/api/v1/activities")).j.items; assert.strictEqual(rows.find(x => x.id === B).count, 1);
});
test("activité fermée : formulaire refusé, données conservées", async () => {
  await adm("/api/v1/activities/" + B, "PUT", def("Activité B", { status: "closed" }));
  assert.strictEqual((await J("/api/v1/public/activities/" + B)).s, 404);
  assert.strictEqual((await pub(B, { nom: "Z", email: "z@z.zz" })).s, 404);
  assert.strictEqual((await adm(`/api/v1/activities/${B}/records`)).j.total, 1);
  await adm("/api/v1/activities/" + B, "PUT", def("Activité B"));
});
test("export CSV (neutralisation des formules) et JSON", async () => {
  await adm("/api/v1/activities/" + B, "PUT", def("Activité B"));
  await pub(B, { nom: "=HYPERLINK(1)", email: "csv@z.zz" });
  const raw = Buffer.from(await (await fetch(S.base + `/api/v1/activities/${B}/export?format=csv`, { headers: AH() })).arrayBuffer());
  assert.deepStrictEqual([...raw.subarray(0, 3)], [0xEF, 0xBB, 0xBF], "BOM UTF-8 pour Excel"); const csv = raw.toString("utf8"); assert.ok(csv.includes("Reçu le")); assert.ok(csv.includes("\"'=HYPERLINK(1)\""));
  const js = (await adm(`/api/v1/activities/${B}/export?format=json`)).j; assert.strictEqual(js.items.length, 2);
  assert.strictEqual((await J(`/api/v1/activities/${B}/export`)).s, 401);
});
test("import de fichier : nouveaux, doublons, rejets", async () => {
  const r = await adm(`/api/v1/activities/${B}/import`, "POST", { items: [{ nom: "N1", email: "n1@z.cd" }, { nom: "N2", email: "n2@z.cd" }, { nom: "Dup", email: "N1@z.cd" }, { nom: "", email: "x@z.cd" }] });
  assert.deepStrictEqual([r.j.inserted, r.j.duplicates, r.j.rejected], [2, 1, 1]);
  const again = await adm(`/api/v1/activities/${B}/import`, "POST", { items: [{ nom: "N1", email: "n1@z.cd" }] }); assert.strictEqual(again.j.inserted, 0);
  assert.strictEqual((await adm(`/api/v1/activities/${B}/import`, "POST", { items: "non" })).s, 400);
});
test("limitation de débit sur les envois publics", async () => {
  await adm("/api/v1/activities/rate1", "PUT", def("Rate"));
  const codes = []; for (let i = 0; i < 13; i++) codes.push((await pub("rate1", { nom: "N" + i, email: `r${i}@r.rr` })).s);
  assert.strictEqual(codes.filter(c => c === 201).length, 10); assert.ok(codes.includes(429));
});

/* ===== Sources externes : découverte, analyse, import ===== */
let s1, s2, s3;
test("ajout d'une source : la clé API est chiffrée et jamais renvoyée", async () => {
  const r = await adm("/api/v1/sources", "POST", { name: "Mock bon", base_url: MOCK, auth_type: "bearer", secret: "goodkey" }); assert.strictEqual(r.s, 201); s1 = r.j.id;
  assert.strictEqual(r.j.has_secret, true); assert.ok(!JSON.stringify(r.j).includes("goodkey"));
  assert.ok(!JSON.stringify((await adm("/api/v1/sources")).j).includes("goodkey"));
  const db = new DatabaseSync(path.join(S.dir, "collect-pro.db"), { readOnly: true }); const row = db.prepare("SELECT secret_enc FROM sources WHERE id=?").get(s1); db.close();
  assert.ok(row.secret_enc && !row.secret_enc.includes("goodkey"));
  s2 = (await adm("/api/v1/sources", "POST", { name: "Mock mauvaise clé", base_url: MOCK, auth_type: "bearer", secret: "wrongkey-xyz-77" })).j.id;
  s3 = (await adm("/api/v1/sources", "POST", { name: "Injoignable", base_url: "http://127.0.0.1:" + await closedPort() })).j.id;
  assert.strictEqual((await adm("/api/v1/sources", "POST", { name: "", base_url: MOCK })).s, 400);
  assert.strictEqual((await adm("/api/v1/sources", "POST", { name: "x", base_url: "file:///etc/passwd" })).s, 400);
  assert.strictEqual((await adm("/api/v1/sources", "POST", { name: "x", base_url: MOCK, auth_type: "header", auth_name: "bad name", secret: "k" })).s, 400);
});
test("« Analyser les données » : tâche de fond avec progression, résultats réels et erreurs visibles", async () => {
  const st = await adm("/api/v1/jobs/analyze", "POST", {}); assert.strictEqual(st.s, 202);
  const dup = await adm("/api/v1/jobs/analyze", "POST", {}); assert.strictEqual(dup.s, 409, "pas deux analyses en même temps");
  const j = await waitJob(st.j.id);
  assert.strictEqual(j.status, "done"); assert.strictEqual(j.progress, 100); assert.match(j.message, /2\/3/);
  const src = (await adm("/api/v1/sources")).j.items;
  const a = src.find(x => x.id === s1).probe; assert.strictEqual(a.reachable, true); assert.strictEqual(a.title, "Mock People API");
  assert.deepStrictEqual(a.endpoints.map(e => e.path).sort(), ["/flaky", "/people"], "seuls les GET sont listés"); assert.ok(a.docs_url.endsWith("/openapi.json")); assert.ok(a.auth.schemes.length);
  const b = src.find(x => x.id === s2); assert.strictEqual(b.probe.status, 401); assert.strictEqual(b.status, "auth"); assert.match(b.probe.auth.hint, /refusé/);
  const c = src.find(x => x.id === s3); assert.strictEqual(c.probe.reachable, false); assert.strictEqual(c.status, "error"); assert.match(c.probe.errors[0], /refusée|injoignable/i);
  const logs = (await adm("/api/v1/logs/sync")).j.items.filter(x => x.job_id === st.j.id); assert.strictEqual(logs.length, 3); assert.strictEqual(logs.filter(x => x.status === "error").length, 1);
});
test("import : configuration, aperçu, validation obligatoire, import vérifié, idempotence", async () => {
  await adm("/api/v1/activities/people1", "PUT", { name: "Personnes API", desc: "", kind: "forms", status: "active", fields: [{ key: "nom", label: "Nom", type: "text", required: true }, { key: "email", label: "E-mail", type: "email", required: true }, { key: "ville", label: "Ville", type: "text", required: false }] });
  const cfg = { activity_id: "people1", endpoint: "/people", items_path: "data", external_id_path: "id", mapping: { nom: "full_name", email: "mail", ville: "city" } };
  assert.strictEqual((await adm(`/api/v1/jobs/import`, "POST", { sourceId: s1 })).s, 400, "pas de configuration");
  assert.strictEqual((await adm(`/api/v1/sources/${s1}/import-config`, "PUT", { ...cfg, mapping: { inconnu: "x" } })).s, 400);
  assert.strictEqual((await adm(`/api/v1/sources/${s1}/import-config`, "PUT", cfg)).s, 200);
  assert.strictEqual((await adm(`/api/v1/jobs/import`, "POST", { sourceId: s1 })).s, 400, "source non validée");
  const pv = await adm(`/api/v1/sources/${s1}/preview`, "POST"); assert.strictEqual(pv.j.total, 3); assert.strictEqual(pv.j.sample[0].mapped.nom, "Alice"); assert.ok(pv.j.sample[2].error);
  assert.strictEqual((await adm(`/api/v1/sources/${s1}/validate`, "POST", { validated: true })).j.validated, true);
  const j = await waitJob((await adm("/api/v1/jobs/import", "POST", { sourceId: s1 })).j.id);
  assert.strictEqual(j.status, "done"); assert.deepStrictEqual([j.result.inserted, j.result.rejected, j.result.verified], [2, 1, true]);
  assert.strictEqual((await adm("/api/v1/activities/people1/records")).j.total, 2);
  const j2 = await waitJob((await adm("/api/v1/jobs/import", "POST", { sourceId: s1 })).j.id);
  assert.deepStrictEqual([j2.result.inserted, j2.result.duplicates], [0, 2], "réimport : aucune ligne dupliquée");
  assert.strictEqual((await adm("/api/v1/activities/people1/records")).j.total, 2);
  assert.strictEqual((await adm(`/api/v1/sources/${s1}`, "DELETE")).s, 409, "source ayant fourni des données");
  assert.strictEqual((await adm(`/api/v1/sources/${s1}/import-config`, "PUT", cfg)).j.validated, false, "modifier la configuration retire la validation");
  await adm(`/api/v1/sources/${s1}/validate`, "POST", { validated: true });
});
test("nouvelles tentatives sur une source instable (500 puis 200)", async () => {
  const sid = (await adm("/api/v1/sources", "POST", { name: "Instable", base_url: MOCK, auth_type: "bearer", secret: "goodkey" })).j.id;
  await adm(`/api/v1/sources/${sid}/import-config`, "PUT", { activity_id: "people1", endpoint: "/flaky", mapping: { nom: "n", email: "m" } });
  const pv = await adm(`/api/v1/sources/${sid}/preview`, "POST"); assert.strictEqual(pv.s, 200); assert.ok(pv.j.attempts >= 2); assert.strictEqual(pv.j.total, 1);
});
test("import avec mauvaise clé : échec clair, rien d'inséré, erreur journalisée", async () => {
  await adm(`/api/v1/sources/${s2}/import-config`, "PUT", { activity_id: "people1", endpoint: "/people", items_path: "data", mapping: { nom: "full_name", email: "mail" } });
  await adm(`/api/v1/sources/${s2}/validate`, "POST", { validated: true });
  const before = (await adm("/api/v1/activities/people1/records")).j.total;
  const j = await waitJob((await adm("/api/v1/jobs/import", "POST", { sourceId: s2 })).j.id);
  assert.strictEqual(j.status, "error"); assert.match(j.message, /refusé/);
  assert.strictEqual((await adm("/api/v1/activities/people1/records")).j.total, before);
  assert.strictEqual((await adm("/api/v1/logs/sync")).j.items[0].status, "error");
});
test("protection SSRF : adresses privées refusées quand ALLOW_PRIVATE_SOURCES n'est pas défini", async () => {
  const x = await startServer({ ADMIN_EMAIL: "ssrf@t.cd", ADMIN_PASSWORD: "mot-de-passe-long-2", ALLOW_PRIVATE_SOURCES: "" });
  const tk = (await J("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: "ssrf@t.cd", password: "mot-de-passe-long-2" }) }, x.base)).j.token;
  for (const u of [MOCK, "http://localhost:9/", "http://169.254.169.254/latest", "http://[::1]:80/", "http://10.0.0.5/"]) {
    const r = await adm("/api/v1/sources", "POST", { name: "x", base_url: u }, x.base, tk); assert.strictEqual(r.s, 400, u); assert.match(r.j.error, /privée|locale|introuvable/i, u);
  }
  x.proc.kill();
});

/* ===== Cohérence, sauvegarde, journaux, fichiers ===== */
test("vérification de cohérence", async () => {
  const r = (await adm("/api/v1/admin/consistency")).j; assert.ok(r.checks.length >= 6); assert.ok(r.checks.every(c => c.ok || /erreur de synchronisation/i.test(c.name)), JSON.stringify(r.checks.filter(c => !c.ok)));
  const ov = (await adm("/api/v1/admin/overview")).j; assert.ok(ov.submissions > 30); assert.strictEqual(ov.sources, 4);
});
test("sauvegarde : création, téléchargement, restauration par script", async () => {
  const c = await adm("/api/v1/backups", "POST"); assert.strictEqual(c.s, 201);
  assert.ok((await adm("/api/v1/backups")).j.items.some(b => b.name === c.j.name));
  const dl = await fetch(S.base + "/api/v1/backups/" + c.j.name, { headers: AH() }); assert.strictEqual(dl.status, 200);
  const buf = Buffer.from(await dl.arrayBuffer()); assert.strictEqual(buf.subarray(0, 15).toString(), "SQLite format 3");
  assert.strictEqual((await fetch(S.base + "/api/v1/backups/" + c.j.name)).status, 401);
  assert.strictEqual((await adm("/api/v1/backups/collect-pro-..%2F..%2Fx.db")).s, 404);
  const d2 = mk("cp-restore-");
  execFileSync(process.execPath, ["--disable-warning=ExperimentalWarning", path.join(ROOT, "restore.js"), path.join(S.dir, "backups", c.j.name)], { env: { ...process.env, DATA_DIR: d2, ENV_FILE: path.join(ENVDIR, "none") }, stdio: "pipe" });
  const db = new DatabaseSync(path.join(d2, "collect-pro.db"), { readOnly: true });
  assert.ok(db.prepare("SELECT COUNT(*) c FROM submissions").get().c > 30); assert.strictEqual(db.prepare("SELECT COUNT(*) c FROM activities WHERE id='actA1'").get().c, 1); db.close();
});
test("journal d'audit : opérations tracées, sans secrets ni mots de passe", async () => {
  const l = (await adm("/api/v1/logs/audit?limit=500")).j.items, acts = new Set(l.map(x => x.action));
  for (const a of ["login", "login_failed", "activity_created", "record_deleted", "record_restored", "source_created", "job_analyze", "import_api", "backup_created", "import_file", "export"]) assert.ok(acts.has(a), "manque : " + a);
  const raw = JSON.stringify(l); for (const secret of [PW, "goodkey", "wrongkey-xyz-77", "autre-mot-de-passe-long"]) assert.ok(!raw.includes(secret), "fuite : " + secret);
});
test("reprise de l'ancienne base db.json", async () => {
  const dir = mk("cp-legacy-");
  fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({ activities: { old11: { def: { name: "Ancienne", desc: "", kind: "forms", status: "active", fields: def("x").fields }, subs: [
    { id: "s1", at: 1700000000000, data: { nom: "Ancien", email: "ancien@z.cd" } }, { id: "s2", at: 1700000001000, data: { nom: "Ancien2", email: "ANCIEN@z.cd" } }] } } }));
  const x = await startServer({ ADMIN_EMAIL: "l@t.cd", ADMIN_PASSWORD: "mot-de-passe-long-3" }, dir);
  assert.strictEqual((await J("/api/v1/public/activities/old11", {}, x.base)).s, 200);
  const tk = (await J("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: "l@t.cd", password: "mot-de-passe-long-3" }) }, x.base)).j.token;
  assert.strictEqual((await adm("/api/v1/activities/old11/records", "GET", undefined, x.base, tk)).j.total, 1, "doublon de l'ancienne base ignoré");
  assert.ok(fs.existsSync(path.join(dir, "db.json.migrated")) && !fs.existsSync(path.join(dir, "db.json"))); x.proc.kill();
});
test("une analyse interrompue par un redémarrage est marquée en erreur", async () => {
  const dir = mk("cp-restart-"), db0 = path.join(dir, "collect-pro.db");
  const x = await startServer({ ADMIN_EMAIL: "r@t.cd", ADMIN_PASSWORD: "mot-de-passe-long-4" }, dir); x.proc.kill(); await sleep(300);
  const db = new DatabaseSync(db0); db.prepare("INSERT INTO jobs(id,type,status,created_at) VALUES('abcdef0123456789','analyze','running',1)").run(); db.close();
  const y = await startServer({ ADMIN_EMAIL: "r@t.cd", ADMIN_PASSWORD: "mot-de-passe-long-4" }, dir);
  const tk = (await J("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: "r@t.cd", password: "mot-de-passe-long-4" }) }, y.base)).j.token;
  const j = (await adm("/api/v1/jobs/abcdef0123456789", "GET", undefined, y.base, tk)).j; assert.strictEqual(j.status, "error"); assert.match(j.message, /redémarrage/); y.proc.kill();
});
test("fichiers : pages publiques servies, données et sources privées protégées", async () => {
  for (const u of ["/", "/app.html", "/form.html", "/admin.html", "/style.css", "/app.js", "/admin.js", "/app.css", "/landing.css", "/form.js", "/landing.js"]) assert.strictEqual((await fetch(S.base + u)).status, 200, u);
  for (const u of ["/server.js", "/.env", "/data/collect-pro.db", "/db.js", "/auth.js", "/sources.js", "/jobs.js", "/net.js", "/crypto.js", "/env.js", "/backup.js", "/validate.js", "/001_init.sql", "/restore.js", "/create-admin.js", "/package.json", "/api.test.js", "/README.md", "/.env.example", "/start.bat", "/css/../server.js", "/%2e%2e/server.js", "/js/%2e%2e/data/collect-pro.db"])
    assert.strictEqual((await fetch(S.base + u)).status, 404, u);
});
