// A small JSON-file database: students, sign-in codes, and named collections for every section.
// Good for one server and a campus-sized user base. Writes are batched and atomic (temp file + rename).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function createStore(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let data = { users: {}, codes: {}, col: {}, seq: {} };
  try { data = { ...data, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* first run */ }
  data.col ||= {}; data.seq ||= {};
  let timer = null;
  const flush = () => {
    timer = null;
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  };
  const save = () => { if (!timer) timer = setTimeout(flush, 40); };
  const col = (name) => (data.col[name] ||= {});
  const now = () => new Date().toISOString();

  return {
    dir: path.dirname(file),
    flushNow() { if (timer) { clearTimeout(timer); flush(); } },

    // Students
    userByEmail(email) { return Object.values(data.users).find((u) => u.email === email) || null; },
    userById(id) { return data.users[id] || null; },
    userCount() { return Object.keys(data.users).length; },
    createUser(email) {
      const u = { id: crypto.randomUUID(), email, name: '', phone: '', regNo: '', gender: '', createdAt: now(), updatedAt: now() };
      data.users[u.id] = u; save(); return u;
    },
    updateUser(id, patch) {
      const u = data.users[id]; if (!u) return null;
      Object.assign(u, patch, { updatedAt: now() }); save(); return u;
    },
    deleteUser(id) { const u = data.users[id]; if (!u) return false; delete data.users[id]; delete data.codes[u.email]; save(); return true; },

    // Sign-in codes
    getCode(email) { return data.codes[email] || null; },
    setCode(email, rec) { data.codes[email] = rec; save(); },
    dropCode(email) { delete data.codes[email]; save(); },
    pruneCodes(t = Date.now()) {
      let changed = false;
      for (const [k, v] of Object.entries(data.codes)) if (v.exp < t && (!v.hourStart || t - v.hourStart > 3600e3)) { delete data.codes[k]; changed = true; }
      if (changed) save();
    },

    // Collections: list, get, put (insert or replace), patch, remove
    list(name, filter) { const all = Object.values(col(name)); return filter ? all.filter(filter) : all; },
    get(name, id) { return col(name)[id] || null; },
    put(name, doc) {
      const d = { ...doc, id: doc.id || crypto.randomUUID(), createdAt: doc.createdAt || now(), updatedAt: now() };
      col(name)[d.id] = d; save(); return d;
    },
    patch(name, id, p) { const d = col(name)[id]; if (!d) return null; Object.assign(d, p, { updatedAt: now() }); save(); return d; },
    remove(name, id) { const had = Boolean(col(name)[id]); delete col(name)[id]; if (had) save(); return had; },
    count(name) { return Object.keys(col(name)).length; },

    // Daily counters, e.g. canteen tokens: next('food:foodys:2026-11-02') -> 1, 2, 3 ...
    next(key) { data.seq[key] = (data.seq[key] || 0) + 1; save(); return data.seq[key]; },
  };
}
