"use strict";
// Restaure une sauvegarde. ARRÊTEZ LE SERVEUR AVANT. Usage : node restore.js data/backups/collect-pro-XXXX.db
const fs = require("fs"), path = require("path");
const ROOT = __dirname;
require("./env").loadEnv(path.join(ROOT, ".env"));
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
const src = process.argv[2];
if (!src || !fs.existsSync(src)) { console.error("Indiquez le fichier de sauvegarde existant : node restore.js <fichier.db>"); process.exit(1); }
const { DatabaseSync } = require("node:sqlite");
try { const t = new DatabaseSync(src, { readOnly: true }); const ok = t.prepare("PRAGMA integrity_check").get().integrity_check; t.close(); if (ok !== "ok") throw new Error("intégrité : " + ok); }
catch (e) { console.error("Sauvegarde invalide : " + e.message); process.exit(1); }
fs.mkdirSync(DATA, { recursive: true });
const dest = path.join(DATA, "collect-pro.db");
if (fs.existsSync(dest)) { const safe = dest + ".avant-restauration-" + Date.now(); fs.copyFileSync(dest, safe); console.log("Base actuelle conservée : " + safe); }
for (const x of ["-wal", "-shm"]) { try { fs.unlinkSync(dest + x); } catch (e) {} }
fs.copyFileSync(src, dest);
console.log("Restauration terminée. Relancez le serveur.");
