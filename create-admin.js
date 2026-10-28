"use strict";
// Crée ou réinitialise le compte administrateur depuis .env (ADMIN_EMAIL / ADMIN_PASSWORD).
// Usage : node create-admin.js
const path = require("path"), fs = require("fs");
const ROOT = __dirname;
require("./env").loadEnv(path.join(ROOT, ".env"));
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
fs.mkdirSync(DATA, { recursive: true });
const db = require("./db").open(path.join(DATA, "collect-pro.db"), ROOT);
try {
  const r = require("./auth").createOrUpdateAdmin(db, process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
  require("./db").audit(db, null, r.created ? "admin_created_cli" : "admin_password_reset_cli", {});
  console.log(r.created ? "Administrateur créé." : "Mot de passe de l'administrateur mis à jour.");
} catch (e) { console.error("Échec : " + e.message); process.exit(1); }
