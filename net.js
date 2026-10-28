"use strict";
// Accès sortant vers les sources externes : protection SSRF, délais, nouvelles tentatives, taille limitée.
const dns = require("dns").promises, net = require("net");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fatal = m => Object.assign(new Error(m), { fatal: true });

function isPrivate(ip) {
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (net.isIPv4(ip)) { const [a, b] = ip.split(".").map(Number); return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224; }
  const l = ip.toLowerCase(); return l === "::1" || l === "::" || /^f[cd]/.test(l) || /^fe[89ab]/.test(l);
}
async function assertAllowed(u) {
  let url; try { url = new URL(u); } catch (e) { throw fatal("URL invalide"); }
  if (!["http:", "https:"].includes(url.protocol)) throw fatal("Protocole non autorisé (http ou https uniquement)");
  if (process.env.ALLOW_PRIVATE_SOURCES === "1") return url;
  const h = url.hostname.replace(/^\[|\]$/g, "");
  let addrs; try { addrs = net.isIP(h) ? [{ address: h }] : await dns.lookup(h, { all: true }); } catch (e) { throw fatal("Nom de domaine introuvable : " + h); }
  if (addrs.some(a => isPrivate(a.address))) throw fatal("Adresse privée ou locale refusée (protection SSRF). Pour autoriser des services sur votre propre machine, définissez ALLOW_PRIVATE_SOURCES=1 dans .env.");
  return url;
}
async function readCapped(res, max) {
  if (!res.body) return "";
  const rd = res.body.getReader(), chunks = []; let n = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; n += value.length; if (n > max) { rd.cancel(); throw fatal("Réponse trop volumineuse"); } chunks.push(value); }
  return Buffer.concat(chunks).toString("utf8");
}
function explain(e) {
  if (e.fatal) return e.message;
  if (e.name === "AbortError") return "Délai dépassé";
  const c = e.cause && e.cause.code;
  if (c === "ECONNREFUSED") return "Connexion refusée";
  if (c === "ENOTFOUND") return "Nom de domaine introuvable";
  return e.message === "fetch failed" ? "Serveur injoignable" : e.message;
}
async function once(u, headers, timeout, maxBytes) {
  let url = u;
  for (let hops = 0; ; hops++) {
    await assertAllowed(url);
    const c = new AbortController(), t = setTimeout(() => c.abort(), timeout);
    try {
      const res = await fetch(url, { headers, redirect: "manual", signal: c.signal });
      if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.get("location")) { if (hops >= 3) throw fatal("Trop de redirections"); url = new URL(res.headers.get("location"), url).href; continue; }
      const text = await readCapped(res, maxBytes);
      const h = {}; res.headers.forEach((v, k) => h[k] = v);
      let json; try { json = JSON.parse(text); } catch (e) {}
      return { status: res.status, headers: h, text, json };
    } finally { clearTimeout(t); }
  }
}
async function httpGet(u, o = {}) {
  const { headers = {}, timeout = 10000, retries = 2, maxBytes = 5e6 } = o; let last;
  for (let at = 0; at <= retries; at++) {
    try {
      const r = await once(u, headers, timeout, maxBytes);
      if ((r.status === 429 || r.status >= 500) && at < retries) { await sleep(Math.min(3000, (Number(r.headers["retry-after"]) || 0) * 1000 || 300 * 2 ** at)); last = new Error("Le serveur a répondu " + r.status); continue; }
      r.attempts = at + 1; return r;
    } catch (e) { if (e.fatal) throw new Error(explain(e)); last = new Error(explain(e)); if (at < retries) await sleep(300 * 2 ** at); }
  }
  throw last;
}
module.exports = { httpGet, assertAllowed, isPrivate };
