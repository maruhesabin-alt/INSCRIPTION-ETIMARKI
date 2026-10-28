"use strict";
const fs = require("fs"), path = require("path");
function stamp() { return new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15); }
function create(db, dir, keep) {
  fs.mkdirSync(dir, { recursive: true });
  let name = `collect-pro-${stamp()}.db`, n = 1;
  while (fs.existsSync(path.join(dir, name))) name = `collect-pro-${stamp()}-${n++}.db`;
  db.exec(`VACUUM INTO '${path.join(dir, name).replace(/'/g, "''")}'`);
  const all = list(dir);
  all.slice(keep || 14).forEach(f => { try { fs.unlinkSync(path.join(dir, f.name)); } catch (e) {} });
  return name;
}
function list(dir) {
  try { return fs.readdirSync(dir).filter(f => /^collect-pro-[\w-]+\.db$/.test(f)).map(f => { const s = fs.statSync(path.join(dir, f)); return { name: f, size: s.size, at: s.mtimeMs }; }).sort((a, b) => b.at - a.at || (a.name < b.name ? 1 : -1)); }
  catch (e) { return []; }
}
module.exports = { create, list };
