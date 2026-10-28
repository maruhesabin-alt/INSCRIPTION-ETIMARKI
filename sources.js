"use strict";
const crypto = require("crypto");
const { httpGet } = require("./net");
const cr = require("./crypto");
const DOCS = ["/openapi.json", "/swagger.json", "/v3/api-docs", "/api-docs", "/openapi.yaml/../openapi.json", "/.well-known/openapi.json"].filter(p => !p.includes(".."));

function authFor(src) {
  const secret = src.secret_enc ? cr.dec(src.secret_enc) : "";
  const headers = { Accept: "application/json", "User-Agent": "COLLECT-PRO/1.0" };
  let url = u => u;
  if (secret && src.auth_type === "bearer") headers.Authorization = "Bearer " + secret;
  else if (secret && src.auth_type === "header" && src.auth_name) headers[src.auth_name] = secret;
  else if (secret && src.auth_type === "query" && src.auth_name) url = u => u + (u.includes("?") ? "&" : "?") + encodeURIComponent(src.auth_name) + "=" + encodeURIComponent(secret);
  return { headers, url, hasSecret: !!secret };
}
function parseOpenApi(doc, out) {
  out.title = doc.info && doc.info.title || null; out.version = doc.info && doc.info.version || null;
  const sch = (doc.components && doc.components.securitySchemes) || doc.securityDefinitions || {};
  out.auth.schemes = Object.entries(sch).map(([k, v]) => ({ name: k, type: v.type, scheme: v.scheme || v.in || "", param: v.name || "" }));
  if (out.auth.schemes.length) out.auth.hint = "La documentation déclare : " + out.auth.schemes.map(s => s.name + " (" + s.type + (s.scheme ? " " + s.scheme : "") + ")").join(", ") + ".";
  out.servers = (doc.servers || []).map(s => s.url).slice(0, 5);
  for (const [p, item] of Object.entries(doc.paths || {})) {
    if (!item || !item.get || out.endpoints.length >= 200) continue;
    const params = (item.get.parameters || []).filter(x => x.required).length;
    out.endpoints.push({ method: "GET", path: p, summary: String(item.get.summary || item.get.description || "").slice(0, 160), required_params: params });
  }
}
async function probe(src) {
  const out = { reachable: false, status: null, contentType: "", docs_url: null, title: null, version: null, servers: [], auth: { schemes: [], hint: "", key_configured: false }, endpoints: [], errors: [], probed_at: Date.now() };
  const A = authFor(src); out.auth.key_configured = A.hasSecret;
  const base = src.base_url.replace(/\/+$/, "");
  try {
    const r = await httpGet(A.url(base), { headers: A.headers, retries: 1 });
    out.reachable = true; out.status = r.status; out.contentType = r.headers["content-type"] || "";
    if (r.status === 401 || r.status === 403) out.auth.hint = A.hasSecret ? "Le serveur a refusé la clé configurée (" + r.status + ")." : "Le serveur exige une authentification (" + r.status + ") : configurez une clé.";
  } catch (e) { out.errors.push("Connexion : " + e.message); return out; }
  const origin = new URL(base).origin, seen = new Set();
  for (const root of [base, origin]) for (const p of DOCS) {
    const u = root + p; if (seen.has(u)) continue; seen.add(u);
    try {
      const r = await httpGet(A.url(u), { headers: A.headers, retries: 0, timeout: 6000 });
      if (r.status === 200 && r.json && (r.json.openapi || r.json.swagger)) { out.docs_url = u; parseOpenApi(r.json, out); break; }
    } catch (e) { /* emplacement absent : normal */ }
    if (out.docs_url) break;
  }
  if (!out.docs_url) out.errors.push("Aucune documentation OpenAPI/Swagger trouvée aux emplacements habituels. Indiquez l'endpoint à importer manuellement.");
  return out;
}
const getPath = (o, p) => String(p || "").split(".").filter(Boolean).reduce((a, k) => a == null ? undefined : a[k], o);
async function fetchRecords(src, cfg) {
  const A = authFor(src);
  const r = await httpGet(A.url(src.base_url.replace(/\/+$/, "") + cfg.endpoint), { headers: A.headers });
  if (r.status === 401 || r.status === 403) throw new Error("Accès refusé par la source (" + r.status + ") : vérifiez la clé API");
  if (r.status !== 200) throw new Error("La source a répondu " + r.status);
  if (r.json === undefined) throw new Error("La réponse n'est pas du JSON");
  const items = cfg.items_path ? getPath(r.json, cfg.items_path) : (Array.isArray(r.json) ? r.json : (r.json.items || r.json.data || r.json.results));
  if (!Array.isArray(items)) throw new Error("Aucune liste d'enregistrements trouvée (vérifiez le chemin « liste »)");
  return { items, attempts: r.attempts };
}
function mapRecord(def, cfg, rec) {
  const data = {};
  for (const f of def.fields) {
    const p = cfg.mapping && cfg.mapping[f.key]; if (!p) continue;
    let v = getPath(rec, p); if (v === undefined || v === null) continue;
    if (!["number", "check", "multi"].includes(f.type) && typeof v !== "string") v = String(v);
    data[f.key] = v;
  }
  return data;
}
const canon = o => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]));
function externalId(cfg, rec, data) {
  const v = cfg.external_id_path ? getPath(rec, cfg.external_id_path) : undefined;
  return v !== undefined && v !== null && v !== "" ? String(v) : "h:" + crypto.createHash("sha256").update(canon(data)).digest("hex").slice(0, 32);
}
const publicView = s => ({ id: s.id, name: s.name, base_url: s.base_url, auth_type: s.auth_type, auth_name: s.auth_name, has_secret: !!s.secret_enc, status: s.status, validated: !!s.validated,
  probe: s.probe_json ? JSON.parse(s.probe_json) : null, probed_at: s.probed_at, import: s.import_json ? JSON.parse(s.import_json) : null, created_at: s.created_at });
module.exports = { probe, fetchRecords, mapRecord, externalId, publicView, getPath };
