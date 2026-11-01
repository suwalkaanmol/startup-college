require("dotenv").config();
const express = require("express"), http = require("http"), { Server } = require("socket.io");
const cors = require("cors"), helmet = require("helmet"), compression = require("compression"), rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken"), { randomInt, randomUUID } = require("crypto"), L = require("./logic");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, gender TEXT NOT NULL, consent_at TIMESTAMPTZ DEFAULT now());
ALTER TABLE users ADD COLUMN IF NOT EXISTS ext_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_ext ON users(ext_id);
CREATE TABLE IF NOT EXISTS blocks(user_id INT, blocked_id INT, PRIMARY KEY(user_id,blocked_id));
CREATE TABLE IF NOT EXISTS groups(id SERIAL PRIMARY KEY, code TEXT NOT NULL, travel_date TEXT, travel_time TEXT, flex INT, dest TEXT, vehicle TEXT, size INT, girls_only BOOLEAN, sources TEXT, confirmed BOOLEAN DEFAULT false, expires_at TIMESTAMPTZ);
ALTER TABLE groups ADD COLUMN IF NOT EXISTS dir TEXT DEFAULT 'from';
CREATE TABLE IF NOT EXISTS members(group_id INT, user_id INT, username TEXT, hostel TEXT, train TEXT, flex INT, ptime TEXT, PRIMARY KEY(group_id,user_id));
ALTER TABLE members ADD COLUMN IF NOT EXISTS sources TEXT;
CREATE TABLE IF NOT EXISTS messages(id SERIAL PRIMARY KEY, group_id INT, kind TEXT DEFAULT 'message', sender_id INT, sender_username TEXT, body TEXT, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS join_requests(id SERIAL PRIMARY KEY, group_id INT, user_id INT, username TEXT, hostel TEXT, train TEXT, flex INT, ptime TEXT, sources TEXT, vehicle TEXT, created_at TIMESTAMPTZ DEFAULT now());
ALTER TABLE join_requests ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'request';
ALTER TABLE join_requests ADD COLUMN IF NOT EXISTS by_name TEXT;
CREATE TABLE IF NOT EXISTS reports(id SERIAL PRIMARY KEY, reporter INT, reported INT, reason TEXT, created_at TIMESTAMPTZ DEFAULT now());
CREATE INDEX IF NOT EXISTS members_user ON members(user_id);
CREATE INDEX IF NOT EXISTS groups_search ON groups(travel_date,dest);
CREATE INDEX IF NOT EXISTS messages_group ON messages(group_id,id);
CREATE INDEX IF NOT EXISTS requests_group ON join_requests(group_id);`;

function createApp(pool, secret, clientUrl = "http://localhost:5173") {
  const origins = clientUrl.split(",").map(s => s.trim().replace(/\/$/, ""));
  const app = express(), server = http.createServer(app), io = new Server(server, { cors: { origin: origins, credentials: true } });
  const q = async (sql, p = []) => (await pool.query(sql, p)).rows;
  app.set("trust proxy", 1);
  app.use(helmet(), compression(), cors({ origin: origins }), express.json({ limit: "10kb" }));
  if (process.env.NODE_ENV !== "test") { app.use("/api", rateLimit({ windowMs: 6e4, limit: 600 })); }
  const wrap = f => (req, res) => f(req, res).catch(e => { console.error(e); res.status(500).json({ error: "Server error" }); });
  const pub = u => ({ id: u.id, username: u.username, gender: u.gender });
  const userFrom = async token => { // identity comes from the main app's signed token (same JWT_SECRET); first sight creates the local profile
    const c = jwt.verify(token, secret), ext = String(c.sub ?? c.id ?? ""); if (!ext) throw new Error("token has no sub");
    let [u] = await q("SELECT * FROM users WHERE ext_id=$1", [ext]);
    if (!u) {
      const name = String(c.username || c.name || "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 20), gender = String(c.gender || "").toLowerCase();
      if (name.length < 3 || !["male", "female"].includes(gender)) { const e = new Error("claims"); e.code = "CLAIMS"; throw e; }
      for (let k = 0; !u && k < 5; k++) {
        try { [u] = await q("INSERT INTO users(username,email,password,gender,ext_id) VALUES($1,$2,'!',$3,$4) RETURNING *", [k ? name.slice(0, 16) + Math.floor(100 + Math.random() * 900) : name, ext + "@sso.local", gender, ext]); }
        catch (e) { if (e.code !== "23505") throw e; [u] = await q("SELECT * FROM users WHERE ext_id=$1", [ext]); } // username taken → retry with a suffix; parallel first calls → reuse
      }
      if (!u) throw new Error("could not create profile");
    }
    return u;
  };
  const auth = async (req, res, next) => {
    try { const u = await userFrom((req.headers.authorization || "").slice(7)); u.blocked = (await q("SELECT blocked_id FROM blocks WHERE user_id=$1", [u.id])).map(r => r.blocked_id); req.user = u; }
    catch (e) { return res.status(e.code === "CLAIMS" ? 403 : 401).json({ error: e.code === "CLAIMS" ? "Your account needs a username and gender" : "Please open this from the main app" }); }
    next();
  };
  const hostelOf = s => s.find(x => /^(Girls|Boys) /.test(x)) || "";
  const loadMembers = async ids => ids.length ? q(`SELECT * FROM members WHERE group_id IN (${ids.map(Number).join(",")}) ORDER BY ptime`) : [];
  const toLogic = (g, ms) => {
    const gs = JSON.parse(g.sources);
    const members = ms.filter(m => m.group_id === g.id).map(m => ({ id: m.user_id, username: m.username, block: m.hostel, train: m.train, time: m.ptime, timeTo: L.addMin(m.ptime, m.flex), flex: m.flex, sources: m.sources ? JSON.parse(m.sources) : gs }));
    const w = members.length >= 2 ? { s: L.toMin(g.travel_time), e: L.toMin(g.travel_time) + g.flex } : members.length ? L.win(members) : { s: L.toMin(g.travel_time), e: L.toMin(g.travel_time) + g.flex }, e = Math.max(w.s, w.e); // group time = window everyone shares
    return { id: g.id, code: g.code, dir: g.dir || "from", date: g.travel_date, time: L.addMin("00:00", w.s), timeTo: L.addMin("00:00", e), flex: e - w.s, dest: g.dest, vehicle: g.vehicle,
      rawSize: g.size, size: g.size || 4, girlsOnly: !!g.girls_only, sources: gs, confirmed: g.confirmed, members, solo: members.length === 1, pickup: L.pickupFor(members) };
  };
  const view = (g, me) => ({ ...g, seatsLeft: g.size - g.members.length, mine: g.members.some(m => m.id === me) });
  const msgOut = r => ({ _id: r.id, groupId: r.group_id, type: r.kind, senderId: r.sender_id, senderUsername: r.sender_username, text: r.body, createdAt: r.created_at });
  const sys = async (gid, u, action) => { const [m] = await q("INSERT INTO messages(group_id,kind,sender_id,sender_username,body) VALUES($1,'system',$2,$3,$4) RETURNING *", [gid, u.id, u.username, action]); io.to(String(gid)).emit("new_message", msgOut(m)); };
  const ping = () => io.emit("groups_changed");
  const isMember = (gid, uid) => q("SELECT 1 FROM members WHERE group_id=$1 AND user_id=$2", [gid, uid]).then(r => r.length > 0);
  const hasPlan = (uid, date) => q("SELECT 1 FROM members m JOIN groups g ON g.id=m.group_id WHERE m.user_id=$1 AND g.travel_date=$2", [uid, date]).then(r => r.length > 0);
  const inGroup = async (uid, date, c = pool) => { // true only when travelling with at least one other person
    for (const { id } of (await c.query("SELECT g.id FROM groups g JOIN members m ON m.group_id=g.id WHERE m.user_id=$1 AND g.travel_date=$2", [uid, date])).rows)
      if ((await c.query("SELECT count(*)::int AS n FROM members WHERE group_id=$1", [id])).rows[0].n >= 2) return id; return 0; };
  const narrow = async (c, g, ms, s2, f2) => { // group time becomes the window everyone shares
    const w = ms.length >= 2 ? { s: L.toMin(g.travel_time), e: L.toMin(g.travel_time) + g.flex } : L.win(ms.map(m => ({ time: m.ptime, flex: m.flex }))), ns = Math.max(w.s, s2), ne = Math.min(w.e, s2 + f2);
    await c.query("UPDATE groups SET travel_time=$1, flex=$2 WHERE id=$3", [L.addMin("00:00", ns), ne - ns, g.id]); };
  const dropGroup = async (c, gid) => { for (const t of ["messages", "join_requests", "members"]) await c.query(`DELETE FROM ${t} WHERE group_id=$1`, [gid]); await c.query("DELETE FROM groups WHERE id=$1", [gid]); };

  app.get("/api/health", wrap(async (_, res) => { await q("SELECT 1"); res.json({ ok: true }); }));
  const isGuest = u => String(u.ext_id || "").startsWith("guest-");
  app.get("/api/me", auth, (req, res) => res.json({ user: { ...pub(req.user), guest: isGuest(req.user) } }));
  if (process.env.NODE_ENV !== "test") app.use("/api/guest", rateLimit({ windowMs: 36e5, limit: 60, message: { error: "Too many new visitors from this network, try later" } }));
  app.post("/api/guest", wrap(async (req, res) => { // opens straight in: a profile for this device, until the main app sends a real sign-in
    if (process.env.ALLOW_GUESTS === "false") return res.status(403).json({ error: "Open Go2Gether from the main app" });
    const token = jwt.sign({ sub: "guest-" + randomUUID(), username: "Guest" + (1000 + randomInt(9000)), gender: "male" }, secret, { expiresIn: "365d" }), u = await userFrom(token);
    res.json({ token, user: { ...pub(u), guest: true } });
  }));
  app.patch("/api/me", auth, wrap(async (req, res) => { // device profiles pick Boys/Girls themselves; real accounts come from the main app
    if (!isGuest(req.user)) return res.status(403).json({ error: "Managed by the main app" });
    const g = req.body.gender; if (!["male", "female"].includes(g)) return res.status(400).json({ error: "Choose Boys or Girls" });
    if ((await q("SELECT 1 FROM members WHERE user_id=$1", [req.user.id])).length) return res.status(409).json({ error: "Leave your trips before switching" });
    await q("DELETE FROM join_requests WHERE user_id=$1", [req.user.id]);
    const [u] = await q("UPDATE users SET gender=$1 WHERE id=$2 RETURNING *", [g, req.user.id]); res.json({ user: { ...pub(u), guest: true } });
  }));
  app.delete("/api/me", auth, wrap(async (req, res) => {
    for (const r of await q("SELECT group_id FROM members WHERE user_id=$1", [req.user.id])) await leave(r.group_id, req.user);
    await q("DELETE FROM join_requests WHERE user_id=$1", [req.user.id]); await q("DELETE FROM blocks WHERE user_id=$1 OR blocked_id=$1", [req.user.id]); await q("DELETE FROM users WHERE id=$1", [req.user.id]); res.json({ ok: true });
  }));

  const plan = b => ({ sources: b.sources, dir: b.dir === "to" ? "to" : "from", dest: b.dest, vehicle: b.vehicle, size: Number(b.size), girlsOnly: !!b.girlsOnly, date: b.date, time: b.time, timeTo: b.timeTo, train: b.train || "" });
  const addMember = (c, gid, u, p, v) => c.query("INSERT INTO members(group_id,user_id,username,hostel,train,flex,ptime,sources) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [gid, u.id, u.username, hostelOf(p.sources), v.train, v.flex, p.time, JSON.stringify(p.sources)]);

  app.get("/api/groups/search", auth, wrap(async (req, res) => {
    const bl = new Set(req.user.blocked), gq = Number(req.query.groupId) || 0;
    const p = plan({ ...req.query, sources: [].concat(req.query.sources || []), girlsOnly: req.query.girlsOnly === "true" }); if (!p.sources.length) p.sources = ["Main Gate"];
    if (gq) { // invite mode: a group looking for individuals
      const [g] = await q("SELECT * FROM groups WHERE id=$1", [gq]); if (!g || !(await isMember(gq, req.user.id))) return res.status(404).json({ error: "Group not found" });
      const lg = toLogic(g, await loadMembers([gq])); if (lg.members.length < 2) return res.status(400).json({ error: "Not a group" });
      Object.assign(p, { dir: lg.dir, dest: lg.dest, date: lg.date, girlsOnly: lg.girlsOnly, sources: ["Main Gate"], train: "" });
      const v = L.validatePlan(p, req.user.gender); if (v.error) return res.status(400).json(v); p.flex = v.flex;
      if (lg.confirmed || lg.size - lg.members.length <= 0) return res.json({ groups: [], invite: true });
      const gs = await q("SELECT * FROM groups WHERE travel_date=$1 AND dest=$2 AND COALESCE(dir,'from')=$3 AND confirmed=false AND id<>$4", [p.date, p.dest, p.dir, gq]), ms = await loadMembers(gs.map(x => x.id));
      const solos = gs.map(x => toLogic(x, ms)).filter(x => x.solo), ids = solos.map(x => x.members[0].id);
      const genders = ids.length ? Object.fromEntries((await q(`SELECT id, gender FROM users WHERE id IN (${ids.join(",")})`)).map(u => [u.id, u.gender])) : {};
      const invited = new Set((await q("SELECT user_id FROM join_requests WHERE group_id=$1 AND kind='invite'", [gq])).map(r => r.user_id));
      const ok = solos.filter(x => !bl.has(x.members[0].id) && L.compatible(x, { ...p, girlsOnly: false }, "female") && !(x.girlsOnly && !lg.girlsOnly) && !(lg.girlsOnly && genders[x.members[0].id] !== "female"));
      return res.json({ invite: true, groups: L.rank(ok, p).map(x => ({ ...view(x, req.user.id), requested: invited.has(x.members[0].id) })) });
    }
    const v = L.validatePlan(p, req.user.gender); if (v.error) return res.status(400).json(v);
    p.train = v.train; p.flex = v.flex;
    if (await inGroup(req.user.id, p.date)) return res.json({ groups: [] }); // already travelling with others that day
    const gs = await q("SELECT * FROM groups WHERE travel_date=$1 AND dest=$2 AND COALESCE(dir,'from')=$3 AND confirmed=false", [p.date, p.dest, p.dir]), ms = await loadMembers(gs.map(g => g.id));
    const asked = new Set((await q("SELECT group_id FROM join_requests WHERE user_id=$1 AND kind='request'", [req.user.id])).map(r => r.group_id));
    const ok = gs.map(g => toLogic(g, ms)).filter(g => !g.members.some(m => m.id === req.user.id) && g.members.length < g.size && !g.members.some(m => bl.has(m.id)) && L.compatible(g, p, req.user.gender));
    res.json({ groups: L.rank(ok, p).map(g => ({ ...view(g, req.user.id), requested: asked.has(g.id) })) });
  }));
  app.post("/api/groups", auth, wrap(async (req, res) => {
    const p = plan(req.body), v = L.validatePlan(p, req.user.gender); if (v.error) return res.status(400).json(v);
    if (await hasPlan(req.user.id, p.date)) return res.status(409).json({ error: "You already have a trip on this date — edit it instead" });
    const [g] = await q("INSERT INTO groups(code,travel_date,travel_time,flex,dest,dir,vehicle,size,girls_only,sources,expires_at) VALUES('',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
      [p.date, p.time, v.flex, p.dest, p.dir, p.vehicle, p.size, p.girlsOnly, JSON.stringify(p.sources), L.expiry(p.date, p.timeTo)]);
    await addMember(pool, g.id, req.user, p, v); ping(); res.status(201).json({ group: view(toLogic(g, await loadMembers([g.id])), req.user.id) });
  }));
  app.patch("/api/groups/:id", auth, wrap(async (req, res) => {
    const gid = Number(req.params.id), [g] = await q("SELECT * FROM groups WHERE id=$1", [gid]);
    if (!g || !(await isMember(gid, req.user.id))) return res.status(404).json({ error: "Trip not found" });
    const lg = toLogic(g, await loadMembers([gid])), others = lg.members.filter(m => m.id !== req.user.id);
    if (others.length) return res.status(403).json({ error: "Use group settings to change a group trip" });
    const p = plan(req.body), v = L.validatePlan(p, req.user.gender);
    if (v.error) return res.status(400).json(v);
    if (others.length) { const w = L.win(others), s = L.toMin(p.time); if (!(s <= w.e && w.s <= s + v.flex)) return res.status(400).json({ error: "Your time must overlap the group's" }); }
    else if (p.date !== g.travel_date && (await hasPlan(req.user.id, p.date))) return res.status(409).json({ error: "You already have a trip on this date" });
    await q("UPDATE members SET hostel=$1,train=$2,flex=$3,ptime=$4,sources=$5 WHERE group_id=$6 AND user_id=$7", [hostelOf(p.sources), v.train, v.flex, p.time, JSON.stringify(p.sources), gid, req.user.id]);
    if (!others.length) {
      await q("UPDATE groups SET travel_date=$1,travel_time=$2,flex=$3,dest=$4,dir=$5,vehicle=$6,size=$7,girls_only=$8,sources=$9,expires_at=$10 WHERE id=$11", [p.date, p.time, v.flex, p.dest, p.dir, p.vehicle, p.size, p.girlsOnly, JSON.stringify(p.sources), L.expiry(p.date, p.timeTo), gid]);
      if (p.date !== g.travel_date || p.dest !== g.dest || p.dir !== lg.dir) await q("DELETE FROM join_requests WHERE group_id=$1", [gid]);
    }
    io.to(String(gid)).emit("group_updated"); ping(); res.json({ ok: true });
  }));

  app.patch("/api/groups/:id/settings", auth, wrap(async (req, res) => { // common time, group size, transport
    const gid = Number(req.params.id), [g] = await q("SELECT * FROM groups WHERE id=$1", [gid]);
    if (!g || !(await isMember(gid, req.user.id))) return res.status(404).json({ error: "Group not found" });
    const lg = toLogic(g, await loadMembers([gid])); if (lg.members.length < 2) return res.status(400).json({ error: "Edit your trip instead" });
    if (g.confirmed) return res.status(400).json({ error: "Group is confirmed" });
    const b = req.body, size = Number(b.size), p = { ...plan({ ...lg, sources: ["Main Gate"], time: b.time, timeTo: b.timeTo, vehicle: b.vehicle, size, girlsOnly: lg.girlsOnly }), train: "" }, v = L.validatePlan(p, req.user.gender);
    if (v.error) return res.status(400).json(v); if (![3, 4].includes(size) || size < lg.members.length) return res.status(400).json({ error: "Group size must be 3 or 4 and fit everyone" });
    await q("UPDATE groups SET travel_time=$1, flex=$2, size=$3, vehicle=$4, expires_at=$5 WHERE id=$6", [p.time, v.flex, size, p.vehicle, L.expiry(lg.date, p.timeTo), gid]);
    if (size <= lg.members.length) await q("DELETE FROM join_requests WHERE group_id=$1", [gid]);
    await sys(gid, req.user, "updated"); io.to(String(gid)).emit("group_updated"); ping(); res.json({ ok: true });
  }));
  app.post("/api/groups/:id/invite", auth, wrap(async (req, res) => { // a group member invites a listed individual (max 2 open invites)
    const gid = Number(req.params.id), [g] = await q("SELECT * FROM groups WHERE id=$1", [gid]), [tg] = await q("SELECT * FROM groups WHERE id=$1", [Number(req.body.target)]);
    if (!g || !tg || !(await isMember(gid, req.user.id))) return res.status(404).json({ error: "Not found" });
    const lg = toLogic(g, await loadMembers([gid])), tl = toLogic(tg, await loadMembers([tg.id])), who = tl.members[0];
    if (lg.members.length < 2 || !tl.solo || tg.id === gid) return res.status(400).json({ error: "Can't invite this trip" });
    if (g.confirmed || lg.size - lg.members.length <= 0) return res.status(409).json({ error: "Group is full or confirmed" });
    const [u] = await q("SELECT gender FROM users WHERE id=$1", [who.id]);
    if (req.user.blocked.includes(who.id) || !L.compatible(tl, { date: lg.date, dest: lg.dest, dir: lg.dir, vehicle: lg.vehicle, size: lg.rawSize, time: lg.time, flex: lg.flex, girlsOnly: false }, "female")
      || (tl.girlsOnly && !lg.girlsOnly) || (lg.girlsOnly && u.gender !== "female") || (await inGroup(who.id, lg.date))) return res.status(400).json({ error: "This person doesn't match your group" });
    const open = await q("SELECT user_id FROM join_requests WHERE group_id=$1 AND kind='invite'", [gid]);
    if (open.length >= 2 && !open.some(r => r.user_id === who.id)) return res.status(400).json({ error: "You can have 2 open invites at a time" });
    await q("DELETE FROM join_requests WHERE group_id=$1 AND user_id=$2 AND kind='invite'", [gid, who.id]);
    await q("INSERT INTO join_requests(group_id,user_id,username,hostel,train,flex,ptime,sources,vehicle,kind,by_name) VALUES($1,$2,$3,'','',0,'','','','invite',$4)", [gid, who.id, who.username, req.user.username]);
    io.to("u:" + who.id).emit("invite_received", { by: req.user.username }); ping(); res.json({ ok: true });
  }));
  app.post("/api/invites/:id/accept", auth, wrap(async (req, res) => {
    const [r] = await q("SELECT * FROM join_requests WHERE id=$1 AND user_id=$2 AND kind='invite'", [Number(req.params.id), req.user.id]); if (!r) return res.status(404).json({ error: "Invite not found" });
    const c = await pool.connect(); let fail, name = req.user.username;
    try {
      await c.query("BEGIN");
      const g = (await c.query("SELECT * FROM groups WHERE id=$1 FOR UPDATE", [r.group_id])).rows[0], ms = (await c.query("SELECT * FROM members WHERE group_id=$1", [r.group_id])).rows;
      const mine = (await c.query("SELECT m.*, g2.vehicle AS veh, g2.id AS gid2 FROM members m JOIN groups g2 ON g2.id=m.group_id WHERE m.user_id=$1 AND g2.travel_date=$2 AND g2.id<>$3", [req.user.id, g.travel_date, g.id])).rows[0];
      const w = { s: L.toMin(g.travel_time), e: L.toMin(g.travel_time) + g.flex };
      if (!mine) fail = "Your trip for that day is gone"; else if (g.confirmed || ms.length >= (g.size || 4)) fail = "Group is full or already confirmed";
      else if (await inGroup(req.user.id, g.travel_date, c)) fail = "You already joined a group on this date";
      else if (!(L.toMin(mine.ptime) <= w.e && w.s <= L.toMin(mine.ptime) + mine.flex)) fail = "No common departure time any more";
      if (fail) await c.query("DELETE FROM join_requests WHERE id=$1", [r.id]);
      else {
        await dropGroup(c, mine.gid2); // your solo listing is replaced by the group
        await c.query("INSERT INTO members(group_id,user_id,username,hostel,train,flex,ptime,sources) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [g.id, mine.user_id, mine.username, mine.hostel, mine.train, mine.flex, mine.ptime, mine.sources]);
        await narrow(c, g, ms, L.toMin(mine.ptime), mine.flex);
        await c.query("UPDATE groups SET vehicle=$1 WHERE id=$2", [L.resolveVehicle(g.vehicle, mine.veh), g.id]);
        await c.query(`DELETE FROM join_requests WHERE user_id IN (${[req.user.id, ...ms.map(m => m.user_id)].join(",")}) AND group_id IN (SELECT id FROM groups WHERE travel_date=$1)`, [g.travel_date]);
        if (ms.length + 1 >= (g.size || 4)) await c.query("DELETE FROM join_requests WHERE group_id=$1", [g.id]); // full: other invites vanish
      }
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
    if (fail) return res.status(409).json({ error: fail });
    io.in("u:" + req.user.id).socketsJoin(String(r.group_id)); await sys(r.group_id, req.user, "joined"); io.to(String(r.group_id)).emit("group_updated"); ping(); res.json({ ok: true });
  }));
  app.post("/api/invites/:id/decline", auth, wrap(async (req, res) => {
    const [r] = await q("DELETE FROM join_requests WHERE id=$1 AND user_id=$2 AND kind='invite' RETURNING group_id", [Number(req.params.id), req.user.id]);
    if (r) io.to(String(r.group_id)).emit("group_updated"); res.json({ ok: true });
  }));
  app.post("/api/invites/:id/cancel", auth, wrap(async (req, res) => {
    const [r] = await q("SELECT r.* FROM join_requests r JOIN members m ON m.group_id=r.group_id WHERE r.id=$1 AND m.user_id=$2 AND r.kind='invite'", [Number(req.params.id), req.user.id]); if (!r) return res.status(404).json({ error: "Invite not found" });
    await q("DELETE FROM join_requests WHERE id=$1", [r.id]); io.to(String(r.group_id)).emit("group_updated"); ping(); res.json({ ok: true });
  }));
  app.post("/api/groups/:id/join", auth, wrap(async (req, res) => { // sends a request (max 3 open at a time)
    const gid = Number(req.params.id), [g] = await q("SELECT * FROM groups WHERE id=$1", [gid]); if (!g) return res.status(404).json({ error: "Trip not found" });
    const lg = toLogic(g, await loadMembers([gid])), p = plan({ ...req.body, date: g.travel_date, dest: g.dest, dir: lg.dir }), v = L.validatePlan(p, req.user.gender);
    if (v.error) return res.status(400).json(v); p.flex = v.flex;
    if (lg.members.some(m => m.id === req.user.id)) return res.status(400).json({ error: "That's your own trip" });
    if (await inGroup(req.user.id, g.travel_date)) return res.status(409).json({ error: "You are already in a group on this date" });
    if (lg.members.some(m => req.user.blocked.includes(m.id))) return res.status(403).json({ error: "Cannot join this group" });
    if (g.confirmed || lg.members.length >= lg.size) return res.status(409).json({ error: "Group is full or already confirmed" });
    if (!L.compatible(lg, p, req.user.gender)) return res.status(400).json({ error: "This trip doesn't match your plan" });
    const mine = await q("SELECT group_id FROM join_requests WHERE user_id=$1 AND kind='request'", [req.user.id]);
    if (mine.length >= 3 && !mine.some(r => r.group_id === gid)) return res.status(400).json({ error: "You can have 3 open requests at a time" });
    await q("DELETE FROM join_requests WHERE group_id=$1 AND user_id=$2 AND kind='request'", [gid, req.user.id]);
    const [r] = await q("INSERT INTO join_requests(group_id,user_id,username,hostel,train,flex,ptime,sources,vehicle) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id", [gid, req.user.id, req.user.username, hostelOf(p.sources), v.train, v.flex, p.time, JSON.stringify(p.sources), p.vehicle]);
    io.to(String(gid)).emit("join_request", { groupId: gid, username: req.user.username }); res.json({ requested: true, requestId: r.id });
  }));
  const reqFor = async (id, user) => (await q("SELECT r.* FROM join_requests r JOIN members m ON m.group_id=r.group_id WHERE r.id=$1 AND m.user_id=$2 AND r.kind='request'", [Number(id), user.id]))[0];
  app.post("/api/requests/:id/accept", auth, wrap(async (req, res) => {
    const r = await reqFor(req.params.id, req.user); if (!r) return res.status(404).json({ error: "Request not found" });
    const c = await pool.connect(); let fail;
    try {
      await c.query("BEGIN");
      const g = (await c.query("SELECT * FROM groups WHERE id=$1 FOR UPDATE", [r.group_id])).rows[0], ms = (await c.query("SELECT * FROM members WHERE group_id=$1", [r.group_id])).rows;
      const w = L.win(ms.map(m => ({ time: m.ptime, flex: m.flex }))), s = L.toMin(r.ptime);
      if (g.confirmed || ms.length >= (g.size || 4)) fail = "Group is full or already confirmed";
      else if (await inGroup(r.user_id, g.travel_date, c)) fail = "That person already joined another group";
      else if (!(s <= w.e && w.s <= s + r.flex)) fail = "No common departure time any more";
      if (fail) await c.query("DELETE FROM join_requests WHERE id=$1", [r.id]);
      else {
        for (const { id } of (await c.query("SELECT g2.id FROM groups g2 JOIN members m ON m.group_id=g2.id WHERE m.user_id=$1 AND g2.travel_date=$2 AND g2.id<>$3", [r.user_id, g.travel_date, g.id])).rows) await dropGroup(c, id); // their own solo listing is replaced
        await c.query("INSERT INTO members(group_id,user_id,username,hostel,train,flex,ptime,sources) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [r.group_id, r.user_id, r.username, r.hostel, r.train, r.flex, r.ptime, r.sources]);
        await narrow(c, g, ms, s, r.flex);
        await c.query("UPDATE groups SET vehicle=$1 WHERE id=$2", [L.resolveVehicle(g.vehicle, r.vehicle), g.id]);
        const uids = [r.user_id, ...ms.map(m => m.user_id)].join(","); // everyone in the group stops sending requests elsewhere
        await c.query(`DELETE FROM join_requests WHERE user_id IN (${uids}) AND group_id IN (SELECT id FROM groups WHERE travel_date=$1)`, [g.travel_date]);
        if (ms.length + 1 >= (g.size || 4)) await c.query("DELETE FROM join_requests WHERE group_id=$1", [g.id]);
        if (ms.length === 1) await c.query("UPDATE groups SET code=$1 WHERE id=$2", [L.genCode(new Set((await c.query("SELECT code FROM groups")).rows.map(x => x.code))), g.id]);
      }
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
    if (fail) return res.status(409).json({ error: fail });
    io.in("u:" + r.user_id).socketsJoin(String(r.group_id));
    await sys(r.group_id, { id: r.user_id, username: r.username }, "joined"); io.to("u:" + r.user_id).emit("request_accepted", { groupId: r.group_id }); io.to(String(r.group_id)).emit("group_updated"); ping(); res.json({ ok: true });
  }));
  app.post("/api/requests/:id/reject", auth, wrap(async (req, res) => {
    const r = await reqFor(req.params.id, req.user); if (!r) return res.status(404).json({ error: "Request not found" });
    await q("DELETE FROM join_requests WHERE id=$1", [r.id]); io.to("u:" + r.user_id).emit("request_rejected", { groupId: r.group_id }); io.to(String(r.group_id)).emit("group_updated"); res.json({ ok: true });
  }));
  app.post("/api/requests/:id/cancel", auth, wrap(async (req, res) => {
    const [r] = await q("DELETE FROM join_requests WHERE id=$1 AND user_id=$2 AND kind='request' RETURNING group_id", [Number(req.params.id), req.user.id]);
    if (r) io.to(String(r.group_id)).emit("group_updated"); res.json({ ok: true });
  }));
  async function leave(gid, user) {
    await q("DELETE FROM members WHERE group_id=$1 AND user_id=$2", [gid, user.id]); io.in("u:" + user.id).socketsLeave(String(gid));
    const n = (await q("SELECT count(*)::int AS n FROM members WHERE group_id=$1", [gid]))[0].n;
    if (n === 0) { await dropGroup(pool, gid); return ping(); }
    if (n === 1) { await q("DELETE FROM messages WHERE group_id=$1", [gid]); await q("UPDATE groups SET confirmed=false, code='' WHERE id=$1", [gid]); } // back to a solo listing
    await sys(gid, user, "left"); io.to(String(gid)).emit("group_updated"); ping();
  }
  app.post("/api/groups/:id/leave", auth, wrap(async (req, res) => {
    if (!(await isMember(req.params.id, req.user.id))) return res.status(404).json({ error: "Not in this group" });
    await leave(Number(req.params.id), req.user); res.json({ ok: true });
  }));
  app.post("/api/groups/:id/confirm", auth, wrap(async (req, res) => {
    if (!(await isMember(req.params.id, req.user.id))) return res.status(404).json({ error: "Not in this group" });
    if ((await q("SELECT count(*)::int AS n FROM members WHERE group_id=$1", [req.params.id]))[0].n < 2) return res.status(400).json({ error: "Need at least 2 people to confirm" });
    await q("UPDATE groups SET confirmed=true WHERE id=$1", [req.params.id]); await sys(Number(req.params.id), req.user, "confirmed"); io.to(String(req.params.id)).emit("group_updated"); ping(); res.json({ ok: true });
  }));
  app.get("/api/groups/mine", auth, wrap(async (req, res) => {
    const gs = await q("SELECT g.* FROM groups g JOIN members m ON m.group_id=g.id WHERE m.user_id=$1 ORDER BY g.travel_date, g.travel_time", [req.user.id]), ids = gs.map(g => g.id);
    const [ms, rq, outgoing, invs] = await Promise.all([loadMembers(ids), ids.length ? q(`SELECT * FROM join_requests WHERE group_id IN (${ids.join(",")}) ORDER BY id`) : [],
      q("SELECT r.id, r.group_id, g.code, g.dest, g.dir, g.travel_date, g.travel_time, g.flex FROM join_requests r JOIN groups g ON g.id=r.group_id WHERE r.user_id=$1 AND r.kind='request'", [req.user.id]),
      q("SELECT * FROM join_requests WHERE user_id=$1 AND kind='invite' ORDER BY id", [req.user.id])]);
    const om = await loadMembers(outgoing.map(r => r.group_id));
    let invitesIn = []; if (invs.length) { const ig = await q(`SELECT * FROM groups WHERE id IN (${invs.map(r => r.group_id).join(",")})`), im = await loadMembers(ig.map(g => g.id));
      invitesIn = invs.map(r => { const g = ig.find(x => x.id === r.group_id); if (!g) return null; const l = toLogic(g, im); return { id: r.id, by: r.by_name, groupId: g.id, code: l.code, dir: l.dir, dest: l.dest, date: l.date, time: l.time, timeTo: l.timeTo, pickup: l.pickup, members: l.members.map(m => ({ username: m.username, block: m.block })) }; }).filter(Boolean); }
    res.json({ groups: gs.map(g => { const v = view(toLogic(g, ms), req.user.id); return { ...v, fares: L.fares(g.dest, v.pickup),
        requests: rq.filter(r => r.group_id === g.id && r.kind !== "invite").map(r => ({ id: r.id, userId: r.user_id, username: r.username, hostel: r.hostel, train: r.train, time: r.ptime, timeTo: L.addMin(r.ptime, r.flex) })),
        invited: rq.filter(r => r.group_id === g.id && r.kind === "invite").map(r => ({ id: r.id, username: r.username, by: r.by_name })) }; }),
      outgoing: outgoing.map(r => ({ id: r.id, groupId: r.group_id, code: r.code, dest: r.dest, date: r.travel_date, time: r.travel_time, timeTo: L.addMin(r.travel_time, r.flex), to: om.filter(m => m.group_id === r.group_id).map(m => m.username) })), invitesIn });
  }));
  app.get("/api/groups/:id/messages", auth, wrap(async (req, res) => {
    if (!(await isMember(req.params.id, req.user.id))) return res.status(403).json({ error: "Not a member" });
    res.json({ messages: (await q("SELECT * FROM messages WHERE group_id=$1 ORDER BY id LIMIT 300", [req.params.id])).map(msgOut) });
  }));
  app.post("/api/users/:id/block", auth, wrap(async (req, res) => { await q("INSERT INTO blocks VALUES($1,$2) ON CONFLICT DO NOTHING", [req.user.id, Number(req.params.id)]); res.json({ ok: true }); }));
  app.post("/api/users/:id/report", auth, wrap(async (req, res) => { await q("INSERT INTO reports(reporter,reported,reason) VALUES($1,$2,$3)", [req.user.id, Number(req.params.id), String(req.body.reason || "").slice(0, 500)]); res.json({ ok: true }); }));

  io.use(async (s, next) => { try { s.user = await userFrom(s.handshake.auth.token); next(); } catch { next(new Error("auth")); } });
  io.on("connection", s => {
    s.join("u:" + s.user.id);
    s.on("join_room", async gid => { if (await isMember(gid, s.user.id)) s.join(String(gid)); });
    s.on("typing", gid => { if (s.rooms.has(String(gid))) s.to(String(gid)).emit("typing", { groupId: gid, username: s.user.username }); });
    s.on("send_message", async ({ groupId, text, cid }) => {
      const room = String(groupId), t = String(text || "").trim().slice(0, 1000); if (!t || !s.rooms.has(room)) return;
      const [m] = await q("INSERT INTO messages(group_id,sender_id,sender_username,body) VALUES($1,$2,$3,$4) RETURNING *", [groupId, s.user.id, s.user.username, t]);
      io.to(room).emit("new_message", { ...msgOut(m), cid });
    });
  });
  const sweep = async () => { const old = "(SELECT id FROM groups WHERE expires_at < now())";
    for (const t of ["join_requests", "messages", "members"]) await q(`DELETE FROM ${t} WHERE group_id IN ${old}`); await q("DELETE FROM groups WHERE expires_at < now()"); };
  return { app, server, io, sweep };
}

async function main() {
  for (const k of ["DATABASE_URL", "JWT_SECRET"]) if (!process.env[k]) { console.error("Missing env " + k); process.exit(1); }
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
  await pool.query(SCHEMA);
  const { server, sweep } = createApp(pool, process.env.JWT_SECRET, process.env.CLIENT_URL);
  setInterval(() => sweep().catch(console.error), 10 * 60 * 1000).unref();
  server.listen(process.env.PORT || 5000, "0.0.0.0", () => console.log("API up"));
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { createApp, SCHEMA };
