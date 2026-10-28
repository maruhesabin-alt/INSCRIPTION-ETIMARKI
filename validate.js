"use strict";
const TYPES = ["text", "textarea", "email", "tel", "number", "date", "select", "radio", "multi", "check"];

function cleanDef(b) {
  if (!b || typeof b !== "object") return { error: "Définition invalide" };
  const name = String(b.name || "").trim().slice(0, 200);
  if (!name) return { error: "Le nom est obligatoire" };
  if (!Array.isArray(b.fields) || b.fields.length > 60) return { error: "Liste de champs invalide" };
  const seen = new Set(), fields = [];
  for (const f of b.fields) {
    const key = String(f && f.key || ""), label = String(f && f.label || "").trim().slice(0, 200);
    if (!/^[a-z0-9_]{1,60}$/.test(key) || !label || !TYPES.includes(f.type) || seen.has(key)) return { error: "Champ invalide : " + key };
    seen.add(key);
    const options = Array.isArray(f.options) ? f.options.map(o => String(o).slice(0, 200)).slice(0, 100) : [];
    if (["select", "radio", "multi"].includes(f.type) && !options.length) return { error: "Options manquantes pour : " + key };
    fields.push({ key, label, type: f.type, required: !!f.required, options });
  }
  let dedupe_field;
  if (b.dedupe_field !== undefined) {
    if (b.dedupe_field === "" || b.dedupe_field === "auto") dedupe_field = null;
    else if (b.dedupe_field === "none") dedupe_field = "none";
    else if (seen.has(b.dedupe_field)) dedupe_field = b.dedupe_field;
    else return { error: "Champ de détection des doublons inconnu" };
  }
  return { def: { name, desc: String(b.desc || "").slice(0, 2000), kind: b.kind === "messages" ? "messages" : "forms", fields, status: b.status === "active" ? "active" : "closed", dedupe_field } };
}

function validate(fields, data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { error: "Données manquantes" };
  const clean = {};
  for (const f of fields) {
    let v = data[f.key];
    const empty = v === undefined || v === null || v === "" || (f.type === "check" && v === false) || (Array.isArray(v) && !v.length);
    if (empty) { if (f.required) return { error: `Le champ « ${f.label} » est obligatoire` }; continue; }
    switch (f.type) {
      case "check": if (typeof v !== "boolean") return { error: `« ${f.label} » : valeur invalide` }; break;
      case "multi": if (!Array.isArray(v) || v.some(x => !f.options.includes(x))) return { error: `« ${f.label} » : option invalide` }; break;
      case "select": case "radio": if (!f.options.includes(v)) return { error: `« ${f.label} » : option invalide` }; break;
      case "number": v = Number(v); if (!Number.isFinite(v)) return { error: `« ${f.label} » : nombre invalide` }; break;
      case "email": if (typeof v !== "string" || v.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return { error: `« ${f.label} » : adresse e-mail invalide` }; break;
      case "date": if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { error: `« ${f.label} » : date invalide` }; break;
      default: if (typeof v !== "string" || v.length > (f.type === "textarea" ? 5000 : 500)) return { error: `« ${f.label} » : texte invalide ou trop long` };
    }
    clean[f.key] = v;
  }
  return { clean };
}

// Clé de détection des doublons : champ choisi, sinon premier champ e-mail des formulaires ; "none" désactive.
function dedupeKey(def, data) {
  let key = def.dedupe_field;
  if (key === "none") return null;
  if (!key) { if (def.kind === "messages") return null; const f = def.fields.find(x => x.type === "email"); key = f && f.key; }
  if (!key) return null;
  const v = data[key];
  if (v === undefined || v === null || v === "") return null;
  return key + ":" + String(v).trim().toLowerCase();
}
function rowToDef(r) {
  return { id: r.id, name: r.name, desc: r.description, kind: r.kind, status: r.status, fields: JSON.parse(r.fields_json), dedupe_field: r.dedupe_field };
}
module.exports = { cleanDef, validate, dedupeKey, rowToDef, TYPES };
