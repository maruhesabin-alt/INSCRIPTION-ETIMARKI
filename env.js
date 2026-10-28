"use strict";
// Lecture minimale d'un fichier .env : une ligne CLE=VALEUR ; seules les lignes commençant par # sont des commentaires
// (un # au milieu d'une valeur, par exemple dans un mot de passe, est conservé).
const fs = require("fs");
function loadEnv(file) {
  let t; try { t = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""); } catch (e) { return false; }
  for (const raw of t.split(/\r?\n/)) {
    const l = raw.trim(); if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("="); if (i < 1) continue;
    const k = l.slice(0, i).trim(); let v = l.slice(i + 1).trim();
    if (/^(".*"|'.*')$/.test(v)) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
  return true;
}
module.exports = { loadEnv };
