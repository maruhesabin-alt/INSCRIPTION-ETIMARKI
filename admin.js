"use strict";
/* Administration COLLECT PRO : toutes les données viennent du serveur (API /api/v1). */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fd = t => t ? new Date(t).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";
const bytes = n => n > 1e6 ? (n / 1e6).toFixed(1) + " Mo" : Math.max(1, Math.round(n / 1e3)) + " Ko";
const API = location.origin + "/api/v1", TK = "collectpro.v1.token";
let MEM = "";
const tok = { get() { try { return localStorage.getItem(TK) || MEM } catch (e) { return MEM } }, set(v) { MEM = v; try { v ? localStorage.setItem(TK, v) : localStorage.removeItem(TK) } catch (e) {} } };
const S = { tab: "over", act: "", page: 1, q: "", del: false, acts: [] };
let timers = [];
const clearTimers = () => { timers.forEach(clearInterval); timers = []; };

function toast(m, e) { const d = document.createElement("div"); d.textContent = m; if (e) d.className = "e"; $("#toast").append(d); setTimeout(() => d.remove(), 5000); }
const closeDlg = () => $("#dlg").close();
function dlg(html, on) { const d = $("#dlg"); d.innerHTML = html; d.showModal(); on && on(d); return d; }
function confirmBox(msg, fn) { dlg(`<h2>Confirmation</h2><p>${msg}</p><div class="row"><span class="sp"></span><button class="btn g" onclick="closeDlg()">Annuler</button><button class="btn d" id="cy">Confirmer</button></div>`, d => d.querySelector("#cy").onclick = () => { closeDlg(); fn(); }); }

async function api(method, path, body, raw) {
  if (location.protocol === "file:") throw new Error("Ouvrez cette page via le serveur : http://localhost:3000/admin.html");
  const h = {}; if (body !== undefined) h["Content-Type"] = "application/json"; if (tok.get()) h.Authorization = "Bearer " + tok.get();
  let r; try { r = await fetch(API + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }); } catch (e) { throw new Error("Serveur injoignable"); }
  if (r.status === 401 && path !== "/auth/login") { tok.set(""); render(); throw new Error("Session expirée : reconnectez-vous"); }
  if (raw) { if (!r.ok) throw new Error("Erreur " + r.status); return r; }
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Erreur " + r.status); return j;
}
const act = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, 1); } };
async function saveBlob(path, name) { const r = await api("GET", path, undefined, true); const u = URL.createObjectURL(await r.blob()); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); }
const badge = (t, k) => `<span class="badge ${k || ""}">${esc(t)}</span>`;
const jbadge = s => badge({ pending: "En attente", running: "En cours", done: "Terminée", error: "Erreur", cancelled: "Annulée" }[s] || s, { done: "ok", error: "e", running: "w", pending: "w" }[s]);
const tbl = (h, rows, empty) => rows.length ? `<div class="tw"><table><thead><tr>${h.map(x => `<th style="cursor:default">${x}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : `<div class="empty">${empty}</div>`;
window.go = t => { S.tab = t; S.page = 1; render(); };

/* ---------- Connexion ---------- */
function loginView() {
  $("#out").hidden = true; $("#who").textContent = ""; clearTimers();
  $("#app").innerHTML = `<div class="card login"><h1>Connexion</h1><p class="mut">Espace réservé à l'administrateur.</p>
  <form id="lf"><label for="em">Adresse e-mail</label><input id="em" type="email" autocomplete="username" required>
  <label for="pw">Mot de passe</label><input id="pw" type="password" autocomplete="current-password" required>
  <div id="le" class="err" role="alert" style="margin-top:10px"></div><button class="btn" style="width:100%;margin-top:14px" id="lb">Se connecter</button></form></div>`;
  $("#lf").onsubmit = async e => { e.preventDefault(); const b = $("#lb"); b.disabled = true; $("#le").textContent = "";
    try { const r = await api("POST", "/auth/login", { email: $("#em").value, password: $("#pw").value }); tok.set(r.token); render(); }
    catch (x) { $("#le").textContent = x.message; b.disabled = false; } };
}
$("#out").onclick = async () => { try { await api("POST", "/auth/logout"); } catch (e) {} tok.set(""); render(); };

/* ---------- Structure ---------- */
const TABS = [["over", "Vue générale"], ["act", "Activités et inscriptions"], ["src", "Sources et analyse"], ["sync", "Synchronisation"], ["io", "Importer / Exporter"], ["log", "Journal"], ["bak", "Sauvegardes"]];
async function render() {
  clearTimers();
  if (!tok.get()) return loginView();
  try { const me = await api("GET", "/auth/me"); $("#who").textContent = me.user.email; $("#out").hidden = false; }
  catch (e) { if (!tok.get()) return; $("#app").innerHTML = `<div class="empty err">${esc(e.message)}</div>`; return; }
  $("#app").innerHTML = `<h1>Administration</h1><div class="tabs" role="tablist">${TABS.map(t => `<button role="tab" aria-selected="${S.tab === t[0]}" data-t="${t[0]}">${t[1]}</button>`).join("")}</div><div id="tb"></div>`;
  document.querySelectorAll("[data-t]").forEach(b => b.onclick = () => go(b.dataset.t));
  const el = $("#tb"); el.classList.add("enter"); setTimeout(() => el.classList.remove("enter"), 800);
  try { S.acts = (await api("GET", "/activities")).items; if (!S.acts.some(a => a.id === S.act)) S.act = S.acts[0] ? S.acts[0].id : ""; await ({ over: tOver, act: tAct, src: tSrc, sync: tSync, io: tIO, log: tLog, bak: tBak })[S.tab](el); }
  catch (e) { el.innerHTML = `<div class="empty err">${esc(e.message)}</div>`; }
}
const actSelect = id => S.acts.length ? `<select id="${id}" style="width:auto;max-width:280px" aria-label="Activité">${S.acts.map(a => `<option value="${a.id}" ${a.id === S.act ? "selected" : ""}>${esc(a.name)} (${a.count})</option>`).join("")}</select>` : "";
const noAct = `<div class="empty">Aucune activité publiée sur le serveur.<br>Créez-en une dans l'<a href="app.html">espace de gestion</a>, puis ouvrez son onglet « Synchronisation et API » et cliquez sur « Publier ».</div>`;

/* ---------- Vue générale ---------- */
function progressHtml(j) { return `<div><b>${esc(j.message || "…")}</b> ${jbadge(j.status)}</div><div class="prog ${j.status === "running" ? "run" : ""}" role="progressbar" aria-valuenow="${j.progress}" aria-valuemin="0" aria-valuemax="100"><i style="width:${j.progress}%"></i></div>`; }
function track(id, box, done) {
  const tick = async () => { try { const j = await api("GET", "/jobs/" + id); box.innerHTML = progressHtml(j) + (["pending", "running"].includes(j.status) ? `<button class="btn g s" id="cj">Annuler</button>` : ""); const c = box.querySelector("#cj"); if (c) c.onclick = act(async () => { await api("POST", `/jobs/${id}/cancel`); }); if (!["pending", "running"].includes(j.status)) { clearInterval(t); done && done(j); } } catch (e) { clearInterval(t); } };
  const t = setInterval(tick, 800); timers.push(t); tick();
}
async function tOver(el) {
  const o = await api("GET", "/admin/overview"), jobs = (await api("GET", "/jobs")).items;
  el.innerHTML = `<div class="stats">
  <div class="card"><div class="num">${o.submissions}</div>inscriptions et messages</div><div class="card"><div class="num">${o.activities_open}<small style="font-size:16px;color:var(--mut)"> / ${o.activities}</small></div>activités ouvertes</div>
  <div class="card"><div class="num">${o.sources}</div>sources externes</div><div class="card"><div class="num">${o.jobs_running}</div>tâche(s) en cours</div>
  <div class="card"><b>${o.last_sync ? esc(o.last_sync.kind) + " — " + (o.last_sync.status === "ok" ? "réussie" : "en erreur") : "Aucune synchronisation"}</b><div class="mut">${o.last_sync ? fd(o.last_sync.at) : ""}</div></div>
  <div class="card"><b>${bytes(o.db_size)}</b> base de données<div class="mut">${o.backups} sauvegarde(s) · ${o.deleted} supprimé(s) récupérable(s)</div></div></div>
  <div class="card"><h2>Analyser les données</h2><p class="mut">Interroge chaque source configurée : joignabilité, documentation OpenAPI/Swagger, endpoints disponibles, exigences d'authentification. Rien n'est importé sans votre validation.</p>
  <div class="row"><button class="btn big" id="an">Analyser les données</button><button class="btn g" id="co">Vérifier la cohérence</button></div><div id="jb" style="margin-top:12px"></div><div id="cr"></div></div>
  <h2 style="margin-top:20px">Dernières tâches</h2>${tbl(["Type", "État", "Message", "Début"], jobs.slice(0, 8).map(j => [esc({ analyze: "Analyse", import: "Import" }[j.type] || j.type), jbadge(j.status), esc(j.message), fd(j.created_at)]), "Aucune tâche pour le moment.")}`;
  const running = jobs.find(j => ["pending", "running"].includes(j.status)); if (running) track(running.id, $("#jb"), () => tOver(el));
  $("#an").onclick = act(async () => { const r = await api("POST", "/jobs/analyze", {}); track(r.id, $("#jb"), j => { toast(j.message, j.status === "error" ? 1 : 0); tOver(el); }); });
  $("#co").onclick = act(async () => { const r = await api("GET", "/admin/consistency"); $("#cr").innerHTML = `<h2 style="margin-top:14px">Cohérence : ${r.ok ? '<span style="color:var(--ok)">tout est conforme</span>' : '<span class="err">anomalies détectées</span>'}</h2>` + tbl(["Contrôle", "Résultat", "Détail"], r.checks.map(c => [esc(c.name), badge(c.ok ? "OK" : "Anomalie", c.ok ? "ok" : "e"), esc(c.detail)]), ""); });
  timers.push(setInterval(act(async () => { if (S.tab === "over" && !$("#jb").innerHTML) { const n = await api("GET", "/admin/overview"); if (n.submissions !== o.submissions || n.jobs_running !== o.jobs_running) tOver(el); } }), 10000));
}

/* ---------- Activités et inscriptions ---------- */
function fieldHtml(f, v) {
  const id = "e_" + f.key, L = `<label for="${id}">${esc(f.label)}${f.required ? " *" : ""}</label>`;
  if (f.type === "textarea") return L + `<textarea id="${id}" rows="3">${esc(v)}</textarea>`;
  if (f.type === "select") return L + `<select id="${id}"><option value="">—</option>${f.options.map(o => `<option ${v === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  if (f.type === "radio") return `<fieldset id="${id}" style="border:0;padding:0"><label>${esc(f.label)}</label>${f.options.map(o => `<label class="i"><input type="radio" name="${id}" value="${esc(o)}" ${v === o ? "checked" : ""}>${esc(o)}</label>`).join("")}</fieldset>`;
  if (f.type === "multi") return `<fieldset id="${id}" style="border:0;padding:0"><label>${esc(f.label)}</label>${f.options.map(o => `<label class="i"><input type="checkbox" value="${esc(o)}" ${(v || []).includes(o) ? "checked" : ""}>${esc(o)}</label>`).join("")}</fieldset>`;
  if (f.type === "check") return `<label class="i" style="margin-top:12px"><input type="checkbox" id="${id}" ${v ? "checked" : ""}>${esc(f.label)}</label>`;
  return L + `<input id="${id}" type="${f.type}" ${f.type === "number" ? 'step="any"' : ""}value="${esc(v)}">`;
}
function readFields(root, fields) {
  const d = {};
  for (const f of fields) { const id = "e_" + f.key; let v;
    if (f.type === "radio") { const r = root.querySelector(`[name="${id}"]:checked`); v = r ? r.value : ""; }
    else if (f.type === "multi") v = [...root.querySelectorAll(`#${id} input:checked`)].map(i => i.value);
    else if (f.type === "check") v = root.querySelector("#" + id).checked;
    else v = root.querySelector("#" + id).value.trim();
    if (v === "" || v === false || (Array.isArray(v) && !v.length)) continue; d[f.key] = v; }
  return d;
}
const cellv = v => Array.isArray(v) ? v.join(", ") : v === true ? "Oui" : v ?? "";
async function tAct(el) {
  if (!S.acts.length) { el.innerHTML = noAct; return; }
  const a = S.acts.find(x => x.id === S.act), per = 15;
  const r = await api("GET", `/activities/${a.id}/records?per=${per}&page=${S.page}&deleted=${S.del ? 1 : 0}&q=${encodeURIComponent(S.q)}`), pages = Math.max(1, Math.ceil(r.total / per));
  const shown = a.fields.slice(0, 5);
  el.innerHTML = `<div class="row">${actSelect("as")}${badge(a.status === "active" ? "Ouverte" : "Fermée", a.status === "active" ? "ok" : "w")}<input id="q" type="search" style="max-width:220px" placeholder="Rechercher" value="${esc(S.q)}" aria-label="Rechercher">
  <label class="i" style="margin:0"><input type="checkbox" id="dl" ${S.del ? "checked" : ""}> Voir les supprimés</label><span class="sp"></span>
  <button class="btn g s" id="ex1">Export CSV</button><button class="btn g s" id="ex2">Export JSON</button></div>
  <div style="margin-top:12px">${tbl(["Reçu le", ...shown.map(f => esc(f.label)), "Origine", ""], r.items.map(x => [fd(x.at), ...shown.map(f => esc(cellv(x.data[f.key]))), x.source_id ? badge("API #" + x.source_id) : badge("Formulaire"),
    `<button class="btn g s" data-d="${x.id}">${S.del ? "Voir" : "Détail"}</button>${S.del ? ` <button class="btn s" data-r="${x.id}">Restaurer</button>` : ""}`]), r.total || S.q ? "Aucun résultat." : "Aucune réponse reçue pour cette activité.")}</div>
  <div class="row" style="margin-top:10px"><span class="mut">${r.total} résultat(s)</span><span class="sp"></span><button class="btn g s" id="pv" ${S.page <= 1 ? "disabled" : ""}>Précédent</button><span>Page ${S.page}/${pages}</span><button class="btn g s" id="nx" ${S.page >= pages ? "disabled" : ""}>Suivant</button></div>`;
  $("#as").onchange = e => { S.act = e.target.value; S.page = 1; S.q = ""; tAct(el).catch(x => toast(x.message, 1)); };
  let t; $("#q").oninput = e => { clearTimeout(t); t = setTimeout(() => { S.q = e.target.value; S.page = 1; tAct(el).then(() => { const q = $("#q"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }); }, 350); };
  $("#dl").onchange = e => { S.del = e.target.checked; S.page = 1; tAct(el); };
  $("#pv").onclick = () => { S.page--; tAct(el); }; $("#nx").onclick = () => { S.page++; tAct(el); };
  $("#ex1").onclick = act(() => saveBlob(`/activities/${a.id}/export?format=csv`, `collect-pro-${a.id}.csv`)); $("#ex2").onclick = act(() => saveBlob(`/activities/${a.id}/export?format=json`, `collect-pro-${a.id}.json`));
  el.querySelectorAll("[data-r]").forEach(b => b.onclick = act(async () => { await api("POST", `/records/${b.dataset.r}/restore`); toast("Enregistrement restauré."); tAct(el); }));
  el.querySelectorAll("[data-d]").forEach(b => b.onclick = () => { const x = r.items.find(i => i.id === b.dataset.d);
    dlg(`<h2>${S.del ? "Enregistrement supprimé" : "Détail et modification"}</h2><p class="mut">Reçu le ${fd(x.at)}${x.updated_at ? " · modifié le " + fd(x.updated_at) : ""}</p><form id="f">${a.fields.map(f => fieldHtml(f, x.data[f.key])).join("")}
    <div id="fe" class="err" role="alert"></div><div class="row" style="margin-top:14px">${S.del ? "" : '<button type="button" class="btn d s" id="rm">Supprimer</button>'}<span class="sp"></span><button type="button" class="btn g" onclick="closeDlg()">Fermer</button>${S.del ? "" : '<button class="btn">Enregistrer</button>'}</div></form>`, d => {
      if (S.del) d.querySelectorAll("input,select,textarea").forEach(i => i.disabled = true);
      d.querySelector("#f").onsubmit = async e => { e.preventDefault(); try { await api("PATCH", "/records/" + x.id, { data: readFields(d, a.fields) }); closeDlg(); toast("Modifications enregistrées."); tAct(el); } catch (er) { d.querySelector("#fe").textContent = er.message; } };
      const rm = d.querySelector("#rm"); if (rm) rm.onclick = () => { closeDlg(); confirmBox("Supprimer cet enregistrement ? Il restera récupérable dans « Voir les supprimés ».", act(async () => { await api("DELETE", "/records/" + x.id); toast("Enregistrement supprimé."); tAct(el); })); };
    }); });
}

/* ---------- Sources et analyse ---------- */
const AUTH = { none: "Aucune", bearer: "Jeton Bearer", header: "En-tête personnalisé", query: "Paramètre d'URL" };
function sourceDialog(s) {
  dlg(`<h2>${s ? "Modifier" : "Ajouter"} une source</h2><form id="f"><label for="n">Nom *</label><input id="n" required value="${esc(s && s.name)}">
  <label for="u">URL de base de l'API *</label><input id="u" type="url" required placeholder="https://api.exemple.com/v1" value="${esc(s && s.base_url)}">
  <label for="t">Authentification</label><select id="t">${Object.entries(AUTH).map(([k, v]) => `<option value="${k}" ${s && s.auth_type === k ? "selected" : ""}>${v}</option>`).join("")}</select>
  <div id="an"><label for="a">Nom de l'en-tête ou du paramètre</label><input id="a" placeholder="X-API-Key" value="${esc(s && s.auth_name)}"></div>
  <div id="sk"><label for="k">Clé API ${s && s.has_secret ? "(laissez vide pour conserver la clé actuelle)" : ""}</label><input id="k" type="password" autocomplete="off"><p class="mut" style="margin:4px 0">La clé est chiffrée sur le serveur et n'est jamais réaffichée.</p></div>
  <div id="fe" class="err" role="alert"></div><div class="row" style="margin-top:14px"><span class="sp"></span><button type="button" class="btn g" onclick="closeDlg()">Annuler</button><button class="btn">Enregistrer</button></div></form>`, d => {
    const sync = () => { const t = d.querySelector("#t").value; d.querySelector("#an").style.display = ["header", "query"].includes(t) ? "" : "none"; d.querySelector("#sk").style.display = t === "none" ? "none" : ""; }; sync(); d.querySelector("#t").onchange = sync;
    d.querySelector("#f").onsubmit = async e => { e.preventDefault(); const b = { name: d.querySelector("#n").value, base_url: d.querySelector("#u").value, auth_type: d.querySelector("#t").value, auth_name: d.querySelector("#a").value, secret: d.querySelector("#k").value };
      try { await api(s ? "PUT" : "POST", "/sources" + (s ? "/" + s.id : ""), b); closeDlg(); toast("Source enregistrée."); render(); } catch (er) { d.querySelector("#fe").textContent = er.message; } };
  });
}
function importDialog(s) {
  const cur = s.import || {}, eps = (s.probe && s.probe.endpoints) || [];
  dlg(`<h2>Configurer l'import — ${esc(s.name)}</h2><form id="f"><label for="ac">Activité qui recevra les données *</label><select id="ac">${S.acts.map(a => `<option value="${a.id}" ${cur.activity_id === a.id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select>
  <label for="ep">Endpoint à importer *</label><input id="ep" list="eps" required placeholder="/people" value="${esc(cur.endpoint)}"><datalist id="eps">${eps.map(e => `<option value="${esc(e.path)}">${esc(e.summary)}</option>`).join("")}</datalist>
  <label for="ip">Chemin de la liste dans la réponse (vide si la réponse est directement une liste)</label><input id="ip" placeholder="data" value="${esc(cur.items_path)}">
  <label for="ei">Chemin de l'identifiant unique de chaque enregistrement (évite les réimports)</label><input id="ei" placeholder="id" value="${esc(cur.external_id_path)}">
  <h3 style="margin:16px 0 4px">Correspondance des champs</h3><p class="mut" style="margin:0">Pour chaque champ, indiquez le chemin dans l'enregistrement de la source (ex. <span class="mono">contact.email</span>).</p><div id="mp"></div>
  <div id="fe" class="err" role="alert"></div><div class="row" style="margin-top:14px"><span class="sp"></span><button type="button" class="btn g" onclick="closeDlg()">Annuler</button><button class="btn">Enregistrer</button></div></form>`, d => {
    const draw = () => { const a = S.acts.find(x => x.id === d.querySelector("#ac").value); d.querySelector("#mp").innerHTML = a ? a.fields.map(f => `<label for="m_${f.key}">${esc(f.label)}${f.required ? " *" : ""}</label><input id="m_${f.key}" class="mono" value="${esc(cur.activity_id === a.id && cur.mapping ? cur.mapping[f.key] : "")}">`).join("") : ""; };
    draw(); d.querySelector("#ac").onchange = draw;
    d.querySelector("#f").onsubmit = async e => { e.preventDefault(); const a = S.acts.find(x => x.id === d.querySelector("#ac").value), mapping = {}; a.fields.forEach(f => { mapping[f.key] = d.querySelector("#m_" + f.key).value; });
      try { await api("PUT", `/sources/${s.id}/import-config`, { activity_id: a.id, endpoint: d.querySelector("#ep").value, items_path: d.querySelector("#ip").value, external_id_path: d.querySelector("#ei").value, mapping }); closeDlg(); toast("Configuration enregistrée. Faites un aperçu, puis validez la source."); render(); } catch (er) { d.querySelector("#fe").textContent = er.message; } };
  });
}
async function tSrc(el) {
  const list = (await api("GET", "/sources")).items;
  el.innerHTML = `<div class="row"><p class="mut sp" style="margin:0">Le système n'invente aucune source : il analyse celles que vous ajoutez (URL d'API) et rapporte exactement ce qu'il obtient.</p><button class="btn" id="add">+ Ajouter une source</button><button class="btn g" id="all">Analyser toutes les sources</button></div><div id="jb" style="margin:12px 0"></div>
  ${list.length ? list.map(s => { const p = s.probe, st = { reachable: ["Joignable", "ok"], auth: ["Accès refusé / clé requise", "w"], error: ["Injoignable", "e"], configured: ["Non analysée", ""] }[s.status] || [s.status, ""];
    return `<div class="card src" style="margin-top:12px"><h3>${esc(s.name)} ${badge(st[0], st[1])} ${s.validated ? badge("Validée", "ok") : badge("Non validée", "w")} ${badge(AUTH[s.auth_type] + (s.has_secret ? " · clé enregistrée" : ""))}</h3>
    <div class="mono mut">${esc(s.base_url)}</div>
    ${p ? `<p>Analysée le ${fd(s.probed_at)} · ${p.title ? esc(p.title) + (p.version ? " v" + esc(p.version) : "") + " · " : ""}${p.endpoints.length} endpoint(s) GET découvert(s)${p.docs_url ? ` · <a href="${esc(p.docs_url)}" target="_blank" rel="noopener">documentation</a>` : ""}</p>
    ${p.auth.hint ? `<p>${esc(p.auth.hint)}</p>` : ""}${p.errors.length ? `<p class="err">${p.errors.map(esc).join("<br>")}</p>` : ""}
    ${p.endpoints.length ? `<details><summary>Voir les endpoints</summary>${tbl(["Chemin", "Description", "Paramètres requis"], p.endpoints.map(e => [`<span class="mono">${esc(e.path)}</span>`, esc(e.summary), e.required_params || 0]), "")}</details>` : ""}` : '<p class="mut">Pas encore analysée.</p>'}
    ${s.import ? `<p class="mut">Import configuré : <span class="mono">${esc(s.import.endpoint)}</span> → activité <span class="mono">${esc(s.import.activity_id)}</span> (${Object.keys(s.import.mapping).length} champ(s))</p>` : ""}
    <div class="row"><button class="btn s" data-a="${s.id}">Analyser</button><button class="btn g s" data-e="${s.id}">Modifier</button><button class="btn g s" data-c="${s.id}">Configurer l'import</button>
    ${s.import ? `<button class="btn g s" data-p="${s.id}">Aperçu</button>${s.validated ? `<button class="btn g s" data-v="${s.id}" data-val="0">Retirer la validation</button><button class="btn s" data-i="${s.id}">Lancer l'import</button>` : `<button class="btn s" data-v="${s.id}" data-val="1">Valider cette source</button>`}` : ""}
    <span class="sp"></span><button class="btn d s" data-x="${s.id}">Supprimer</button></div></div>`; }).join("") : `<div class="empty" style="margin-top:12px">Aucune source configurée. Ajoutez l'URL d'une API que vous êtes autorisé à interroger.</div>`}`;
  const running = (await api("GET", "/jobs")).items.find(j => ["pending", "running"].includes(j.status)); if (running) track(running.id, $("#jb"), () => render());
  const launch = ids => act(async () => { const r = await api("POST", "/jobs/analyze", { sourceIds: ids }); track(r.id, $("#jb"), j => { toast(j.message, j.status === "error" ? 1 : 0); render(); }); });
  $("#add").onclick = () => sourceDialog(); $("#all").onclick = launch([]);
  const by = k => list.find(s => String(s.id) === k);
  el.querySelectorAll("[data-a]").forEach(b => b.onclick = launch([Number(b.dataset.a)])); el.querySelectorAll("[data-e]").forEach(b => b.onclick = () => sourceDialog(by(b.dataset.e)));
  el.querySelectorAll("[data-c]").forEach(b => b.onclick = () => importDialog(by(b.dataset.c)));
  el.querySelectorAll("[data-v]").forEach(b => b.onclick = act(async () => { await api("POST", `/sources/${b.dataset.v}/validate`, { validated: b.dataset.val === "1" }); toast(b.dataset.val === "1" ? "Source validée : l'import est autorisé." : "Validation retirée."); render(); }));
  el.querySelectorAll("[data-x]").forEach(b => b.onclick = () => confirmBox("Supprimer cette source ? (impossible si elle a déjà fourni des données)", act(async () => { await api("DELETE", "/sources/" + b.dataset.x); render(); })));
  el.querySelectorAll("[data-i]").forEach(b => b.onclick = () => confirmBox("Lancer l'import ? Les enregistrements valides seront ajoutés à l'activité cible ; les doublons seront ignorés.", act(async () => { const r = await api("POST", "/jobs/import", { sourceId: Number(b.dataset.i) }); track(r.id, $("#jb"), j => { toast(j.message, j.status === "error" ? 1 : 0); render(); }); })));
  el.querySelectorAll("[data-p]").forEach(b => b.onclick = act(async () => { const pv = await api("POST", `/sources/${b.dataset.p}/preview`);
    const keys = [...new Set(pv.sample.flatMap(x => Object.keys(x.mapped)))];
    dlg(`<h2>Aperçu</h2><p>${pv.total} enregistrement(s) reçu(s) de la source. Voici les ${pv.sample.length} premiers, tels qu'ils seraient importés.</p>${tbl([...keys.map(esc), "Contrôle"], pv.sample.map(x => [...keys.map(k => esc(cellv(x.mapped[k]))), x.error ? `<span class="err">${esc(x.error)}</span>` : badge("Valide", "ok")]), "")}<div class="row" style="margin-top:12px"><span class="sp"></span><button class="btn" onclick="closeDlg()">Fermer</button></div>`); }));
}

/* ---------- Synchronisation ---------- */
async function tSync(el) {
  const [logs, jobs] = await Promise.all([api("GET", "/logs/sync?limit=60"), api("GET", "/jobs")]);
  const K = { analyse: "Analyse", "import-api": "Import API", "import-fichier": "Import fichier" };
  el.innerHTML = `<div class="row"><p class="mut sp" style="margin:0">Une synchronisation n'est marquée « réussie » qu'après vérification en base. Les erreurs gardent leur cause.</p><button class="btn g" id="co">Vérifier la cohérence</button></div><div id="cr"></div>
  <h2 style="margin-top:16px">Historique des synchronisations</h2>${tbl(["Date", "Type", "Source", "Résultat", "Reçus", "Ajoutés", "Doublons", "Rejetés", "Message"], logs.items.map(l => [fd(l.at), esc(K[l.kind] || l.kind), esc(l.source_name || "—"), badge(l.status === "ok" ? "Réussie" : "Erreur", l.status === "ok" ? "ok" : "e"), l.fetched, l.inserted, l.duplicates, l.rejected, esc(l.message)]), "Aucune synchronisation enregistrée.")}
  <h2 style="margin-top:20px">Tâches</h2>${tbl(["Début", "Type", "État", "Message"], jobs.items.map(j => [fd(j.created_at), esc({ analyze: "Analyse", import: "Import" }[j.type] || j.type), jbadge(j.status), esc(j.message)]), "Aucune tâche.")}`;
  $("#co").onclick = act(async () => { const r = await api("GET", "/admin/consistency"); $("#cr").innerHTML = `<h2 style="margin-top:14px">${r.ok ? "Tout est conforme" : '<span class="err">Anomalies détectées</span>'}</h2>` + tbl(["Contrôle", "Résultat", "Détail"], r.checks.map(c => [esc(c.name), badge(c.ok ? "OK" : "Anomalie", c.ok ? "ok" : "e"), esc(c.detail)]), ""); });
}

/* ---------- Importer / Exporter ---------- */
function parseCsv(t) {
  t = t.replace(/^\uFEFF/, ""); const first = t.split(/\r?\n/)[0], sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ";" : ",";
  const rows = []; let row = [], c = "", q = false;
  for (let i = 0; i < t.length; i++) { const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true; else if (ch === sep) { row.push(c); c = ""; } else if (ch === "\n") { row.push(c.replace(/\r$/, "")); rows.push(row); row = []; c = ""; } else c += ch; }
  if (c || row.length) { row.push(c.replace(/\r$/, "")); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
async function tIO(el) {
  if (!S.acts.length) { el.innerHTML = noAct; return; }
  el.innerHTML = `<div class="two"><div class="card"><h2>Exporter</h2><div class="row">${actSelect("as")}</div><p class="mut">Exporte les enregistrements non supprimés de l'activité.</p><div class="row"><button class="btn s" id="e1">CSV (Excel)</button><button class="btn g s" id="e2">JSON</button></div></div>
  <div class="card"><h2>Importer un fichier</h2><p class="mut">CSV ou JSON. Les colonnes CSV peuvent porter le <b>libellé</b> ou l'<b>identifiant</b> du champ. Chaque ligne est validée ; les doublons sont ignorés.</p><input type="file" id="fi" accept=".csv,.json,text/csv,application/json"><div id="ir" style="margin-top:10px"></div></div></div>`;
  const a = () => S.acts.find(x => x.id === S.act);
  $("#as").onchange = e => { S.act = e.target.value; };
  $("#e1").onclick = act(() => saveBlob(`/activities/${S.act}/export?format=csv`, `collect-pro-${S.act}.csv`)); $("#e2").onclick = act(() => saveBlob(`/activities/${S.act}/export?format=json`, `collect-pro-${S.act}.json`));
  $("#fi").onchange = act(async e => { const f = e.target.files[0]; if (!f) return; const t = await f.text(), fields = a().fields; let items;
    if (/\.json$/i.test(f.name)) { let j; try { j = JSON.parse(t); } catch (x) { throw new Error("Fichier JSON invalide"); } items = (Array.isArray(j) ? j : j.items || []).map(x => x && x.data ? x.data : x); }
    else { const rows = parseCsv(t); if (rows.length < 2) throw new Error("Le fichier CSV est vide"); const map = rows[0].map(h => { const x = h.trim().toLowerCase(); const fl = fields.find(y => y.key === x || y.label.toLowerCase() === x); return fl ? fl.key : null; });
      if (!map.some(Boolean)) throw new Error("Aucune colonne ne correspond aux champs de l'activité"); items = rows.slice(1).map(r => { const o = {}; map.forEach((k, i) => { if (!k || r[i] === undefined || r[i] === "") return; const fl = fields.find(y => y.key === k); o[k] = fl.type === "multi" ? r[i].split(/\s*,\s*/) : fl.type === "check" ? /^(oui|true|1)$/i.test(r[i]) : r[i]; }); return o; }); }
    if (!items.length) throw new Error("Aucun enregistrement à importer");
    confirmBox(`Importer ${items.length} ligne(s) dans « ${esc(a().name)} » ?`, act(async () => { const r = await api("POST", `/activities/${S.act}/import`, { items });
      $("#ir").innerHTML = `<div class="note" style="background:#e1f5ed;border-color:#b6e3d2"><b>${esc(r.message)}</b></div>${r.errors.length ? tbl(["Ligne", "Motif du rejet"], r.errors.map(x => [x.row, esc(x.error)]), "") : ""}`; toast("Import terminé."); }));
    e.target.value = ""; });
}

/* ---------- Journal ---------- */
const AL = { login: "Connexion", login_failed: "Échec de connexion", logout: "Déconnexion", admin_created: "Administrateur créé", activity_created: "Activité créée", activity_updated: "Activité modifiée", record_updated: "Enregistrement modifié", record_deleted: "Enregistrement supprimé", record_restored: "Enregistrement restauré", export: "Export", import_file: "Import de fichier", import_api: "Import depuis une API", source_created: "Source ajoutée", source_updated: "Source modifiée", source_deleted: "Source supprimée", source_validated: "Source validée", source_unvalidated: "Validation retirée", source_import_config: "Import configuré", job_analyze: "Analyse lancée", job_import: "Import lancé", backup_created: "Sauvegarde créée", backup_auto: "Sauvegarde automatique", backup_downloaded: "Sauvegarde téléchargée", migration_db_json: "Reprise de l'ancienne base" };
async function tLog(el) { const l = (await api("GET", "/logs/audit?limit=200")).items;
  el.innerHTML = `<p class="mut">Les 200 dernières opérations. Le journal ne contient ni mot de passe, ni clé API, ni contenu des inscriptions.</p>` + tbl(["Date", "Opération", "Utilisateur", "Détails"], l.map(x => [fd(x.at), esc(AL[x.action] || x.action), esc(x.email || "système"), `<span class="mono mut">${esc(x.details === "{}" ? "" : x.details)}</span>`]), "Journal vide."); }

/* ---------- Sauvegardes ---------- */
async function tBak(el) { const l = (await api("GET", "/backups")).items;
  el.innerHTML = `<div class="row"><p class="mut sp" style="margin:0">Une sauvegarde automatique est faite chaque jour tant que le serveur tourne ; les 14 plus récentes sont conservées.</p><button class="btn" id="nb">Créer une sauvegarde maintenant</button></div>
  <div style="margin-top:12px">${tbl(["Fichier", "Date", "Taille", ""], l.map(b => [`<span class="mono">${esc(b.name)}</span>`, fd(b.at), bytes(b.size), `<button class="btn g s" data-n="${esc(b.name)}">Télécharger</button>`]), "Aucune sauvegarde.")}</div>
  <div class="card" style="margin-top:16px"><h2>Restaurer une sauvegarde</h2><ol><li>Arrêtez le serveur (<b>Ctrl + C</b> dans le terminal).</li><li>Lancez : <span class="mono">node restore.js data/backups/NOM-DU-FICHIER.db</span></li><li>Relancez le serveur : <span class="mono">node server.js</span></li></ol><p class="mut">La base actuelle est conservée à côté (« avant-restauration ») avant d'être remplacée. Copiez aussi vos sauvegardes hors de cet ordinateur.</p></div>`;
  $("#nb").onclick = act(async () => { const r = await api("POST", "/backups"); toast("Sauvegarde créée : " + r.name); render(); });
  el.querySelectorAll("[data-n]").forEach(b => b.onclick = act(() => saveBlob("/backups/" + b.dataset.n, b.dataset.n)));
}
render();
