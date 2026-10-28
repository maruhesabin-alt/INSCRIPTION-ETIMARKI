"use strict";
// Chiffrement des clés API des sources (AES-256-GCM). La clé maître vient de SECRET_KEY ou de data/secret.key.
const crypto = require("crypto"), fs = require("fs"), path = require("path");
let KEY;
function init(dataDir) {
  let s = process.env.SECRET_KEY || "";
  if (!s) {
    const f = path.join(dataDir, "secret.key");
    try { s = fs.readFileSync(f, "utf8").trim(); } catch (e) {}
    if (!s) { s = crypto.randomBytes(32).toString("hex"); fs.writeFileSync(f, s, { mode: 0o600 }); }
  }
  KEY = crypto.createHash("sha256").update(s).digest();
}
function enc(text) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([c.update(String(text), "utf8"), c.final()]);
  return [iv, c.getAuthTag(), ct].map(b => b.toString("base64")).join(".");
}
function dec(s) {
  const [iv, tag, ct] = s.split(".").map(x => Buffer.from(x, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", KEY, iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}
module.exports = { init, enc, dec };
