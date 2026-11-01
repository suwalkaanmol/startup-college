// A small JSON-file store. Good for one server instance and a campus-sized user base.
// Swap for Postgres later by keeping the same function names.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function createStore(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let data = { users: {}, codes: {} };
  try { data = { ...data, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* first run */ }
  let timer = null;
  const flush = () => {
    timer = null;
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  };
  const save = () => { if (!timer) timer = setTimeout(flush, 50); };

  return {
    flushNow() { if (timer) { clearTimeout(timer); flush(); } },
    // Users are keyed by id; email is unique (lower-case).
    userByEmail(email) { return Object.values(data.users).find((u) => u.email === email) || null; },
    userById(id) { return data.users[id] || null; },
    createUser(email) {
      const now = new Date().toISOString();
      const u = { id: crypto.randomUUID(), email, name: '', phone: '', regNo: '', gender: '', createdAt: now, updatedAt: now };
      data.users[u.id] = u; save(); return u;
    },
    updateUser(id, patch) {
      const u = data.users[id]; if (!u) return null;
      Object.assign(u, patch, { updatedAt: new Date().toISOString() }); save(); return u;
    },
    deleteUser(id) { const u = data.users[id]; if (!u) return false; delete data.users[id]; delete data.codes[u.email]; save(); return true; },
    getCode(email) { return data.codes[email] || null; },
    setCode(email, rec) { data.codes[email] = rec; save(); },
    dropCode(email) { delete data.codes[email]; save(); },
    pruneCodes(now = Date.now()) {
      let changed = false;
      for (const [k, v] of Object.entries(data.codes)) if (v.exp < now && (!v.hourStart || now - v.hourStart > 3600e3)) { delete data.codes[k]; changed = true; }
      if (changed) save();
    },
  };
}
