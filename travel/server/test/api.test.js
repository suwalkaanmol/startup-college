process.env.NODE_ENV = "test";
const t = require("node:test"), a = require("node:assert/strict"), { newDb } = require("pg-mem"), { createApp, SCHEMA } = require("../index");
const day = n => new Date(Date.now() + 330 * 6e4 + n * 864e5).toISOString().slice(0, 10);
const jwt = require("jsonwebtoken"), SECRET = "s".repeat(40);
let base, S, post, get, patch, P_POOL; const tok = {}, ids = {};
t.before(async () => {
  let pool; if (process.env.TEST_DATABASE_URL) { pool = new (require("pg").Pool)({ connectionString: process.env.TEST_DATABASE_URL }); await pool.query("DROP TABLE IF EXISTS users,blocks,groups,members,messages,reports,join_requests"); } else { const { Pool } = newDb().adapters.createPg(); pool = new Pool(); }
  await pool.query(SCHEMA); P_POOL = pool; S = createApp(pool, SECRET); await new Promise(r => S.server.listen(0, r)); base = `http://localhost:${S.server.address().port}/api`;
  const call = (m, u, b, k) => fetch(base + u, { method: m, headers: { "content-type": "application/json", ...(k && { authorization: "Bearer " + tok[k] }) }, body: b && JSON.stringify(b) }).then(async r => ({ s: r.status, ...(await r.json()) }));
  post = (u, b, k) => call("POST", u, b, k); get = (u, k) => call("GET", u, null, k); patch = (u, b, k) => call("PATCH", u, b, k);
  for (const [n, g] of [["amit", "male"], ["ravi", "male"], ["sana", "female"], ["tara", "female"], ["dev", "male"], ["kk1", "male"], ["kk2", "male"], ["kk3", "male"], ["kk4", "male"], ["kk5", "male"]]) {
    tok[n] = jwt.sign({ sub: "ext-" + n, username: n, gender: g }, SECRET); ids[n] = (await get("/me", n)).user.id; // what the main app would send
  }
});
t.after(() => { S.server.close(); S.io.close(); });
const P = (o = {}) => ({ dir: "from", sources: ["Main Gate"], dest: "Katpadi Railway Station", vehicle: "Cab", size: 3, date: day(3), time: "10:00", timeTo: "10:30", train: "12607", ...o });
const Q = o => "/groups/search?" + new URLSearchParams(Object.entries({ ...P({ sources: undefined }), ...o }).filter(([, v]) => v !== undefined));
t("identity comes only from the main app's signed token", async () => {
  a.equal((await get("/me")).s, 401); // no token
  tok.bad = jwt.sign({ sub: "x", username: "hacker", gender: "male" }, "wrong-secret"); a.equal((await get("/me", "bad")).s, 401); // not signed by the main app
  tok.nog = jwt.sign({ sub: "y", username: "nogender" }, SECRET); a.equal((await get("/me", "nog")).s, 403); // needs a gender for girls-only
  const first = await get("/me", "amit"), again = await get("/me", "amit"); a.equal(first.user.id, again.user.id); a.equal(first.user.username, "amit"); // same person, same profile
  tok.clash = jwt.sign({ sub: "ext-other", username: "amit", gender: "male" }, SECRET); const c = await get("/me", "clash"); a.equal(c.s, 200); a.notEqual(c.user.username, "amit"); // clashing username gets a suffix
  for (const u of ["/auth/login", "/auth/register"]) a.equal((await fetch(base + u, { method: "POST" })).status, 404); // no login/registration in this app any more
});
let gid, reqId;
t("solo listing → request → accept forms the group (code assigned then)", async () => {
  const c = await post("/groups", P({ sources: ["Main Gate", "Boys C"] }), "amit"); a.equal(c.s, 201); a.equal(c.group.solo, true); a.equal(c.group.code, ""); gid = c.group.id;
  a.equal((await post("/groups", P({ time: "11:00", timeTo: "11:30" }), "amit")).s, 409); // one trip per date
  const s = await get(Q({}), "ravi"); a.equal(s.groups.length, 1); a.equal(s.groups[0].solo, true); a.equal(s.groups[0].trainMatch, true);
  a.equal((await get(Q({ sources: "Boys D" }), "ravi")).groups.length, 1); // different hostel still listed
  const jr = await post(`/groups/${gid}/join`, P({ sources: ["Boys D"] }), "ravi"); a.equal(jr.s, 200); reqId = jr.requestId;
  a.equal((await get(Q({}), "ravi")).groups[0].requested, true);
  a.equal((await post(`/requests/${reqId}/accept`, {}, "tara")).s, 404); // outsiders can't approve
  a.equal((await post(`/requests/${reqId}/accept`, {}, "amit")).s, 200);
  const m = (await get("/groups/mine", "ravi")).groups[0]; a.equal(m.members.length, 2); a.match(m.code, /^[A-Z]\d+$/); a.equal(m.solo, false); a.equal(m.pickup, "Main Gate");
  a.equal((await get(Q({}), "ravi")).groups.length, 0); // a person in a group isn't listed alone
  a.equal((await get(Q({}), "dev")).groups[0].solo, false); // others see it as a group, 1 seat left
});
t("direction, destination and nested time windows", async () => {
  a.equal((await get(Q({ dir: "to" }), "dev")).groups.length, 0); // swapped direction is a different trip
  a.equal((await get(Q({ dest: "Old Bus Stand" }), "dev")).groups.length, 0);
  a.equal((await get(Q({ time: "10:10", timeTo: "10:20" }), "dev")).groups.length, 1); // window nested inside theirs
  a.equal((await get(Q({ time: "09:00", timeTo: "12:00" }), "dev")).groups.length, 1); // window wider than theirs
  a.equal((await get(Q({ time: "11:00", timeTo: "11:30" }), "dev")).groups.length, 0);
  a.equal((await get(Q({ size: "4" }), "dev")).groups.length, 0); // wants 4, group is 3
});
t("3-request limit; first accept clears the others; own solo listing is replaced", async () => {
  const d = day(8), mk = (n, o = {}) => post("/groups", P({ date: d, ...o }), n), gids = {};
  for (const n of ["kk1", "kk2", "kk3", "kk4"]) gids[n] = (await mk(n)).group.id;
  const kk5 = (await mk("kk5", { time: "10:05", timeTo: "10:20" })).group.id;
  const rq = {}; for (const n of ["kk1", "kk2", "kk3"]) { const r = await post(`/groups/${gids[n]}/join`, P({ date: d }), "dev"); a.equal(r.s, 200); rq[n] = r.requestId; }
  a.equal((await post(`/groups/${gids.kk4}/join`, P({ date: d }), "dev")).s, 400);
  a.equal((await post(`/requests/${rq.kk2}/accept`, {}, "kk2")).s, 200);
  const dev = await get("/groups/mine", "dev"); a.equal(dev.outgoing.length, 0); a.equal(dev.groups.length, 1);
  a.equal((await get("/groups/mine", "kk1")).groups[0].requests.length, 0); // their requests vanished
  const r5 = await post(`/groups/${gids.kk2}/join`, P({ date: d, time: "10:05", timeTo: "10:20" }), "kk5"); a.equal(r5.s, 200);
  a.equal((await post(`/requests/${r5.requestId}/accept`, {}, "dev")).s, 200); // any member can approve
  const m5 = await get("/groups/mine", "kk5"); a.equal(m5.groups.length, 1); a.equal(m5.groups[0].members.length, 3); a.notEqual(m5.groups[0].id, kk5);
  a.equal((await post(`/groups/${gids.kk2}/join`, P({ date: d }), "kk4")).s, 409); // group of 3 is full
});
t("group invites individuals: max 2 open, cancel, first accept fills the group and clears the rest", async () => {
  const d = day(15), mk = (n, o = {}) => post("/groups", P({ date: d, ...o }), n);
  const dv = (await mk("dev")).group.id; const r = await post(`/groups/${dv}/join`, P({ date: d }), "kk1"); a.equal((await post(`/requests/${r.requestId}/accept`, {}, "dev")).s, 200); // dev + kk1, one seat left
  const s2 = (await mk("kk2")).group.id, s3 = (await mk("kk3")).group.id, s4 = (await mk("kk4")).group.id;
  const find = await get(`/groups/search?groupId=${dv}&time=10:00&timeTo=10:30&vehicle=Cab&size=3`, "kk1"); a.equal(find.invite, true); a.equal(find.groups.length, 3); a.ok(find.groups.every(x => x.solo));
  a.equal((await get(Q({ date: d }), "kk1")).groups.length, 0); // in a group: normal search shows nothing
  a.equal((await post(`/groups/${dv}/invite`, { target: s2 }, "kk1")).s, 200); a.equal((await post(`/groups/${dv}/invite`, { target: s3 }, "dev")).s, 200); // either member may invite
  a.equal((await post(`/groups/${dv}/invite`, { target: s4 }, "kk1")).s, 400); // max 2 open
  a.equal((await get(`/groups/search?groupId=${dv}&time=10:00&timeTo=10:30&vehicle=Cab&size=3`, "kk1")).groups.filter(x => x.requested).length, 2);
  const mine = await get("/groups/mine", "kk1"); a.equal(mine.groups.find(x => x.id === dv).invited.length, 2);
  a.equal((await post(`/invites/${mine.groups.find(x => x.id === dv).invited.find(i => i.username === "kk3").id}/cancel`, {}, "dev")).s, 200); // cancel sent invite
  a.equal((await get("/groups/mine", "kk3")).invitesIn.length, 0);
  a.equal((await post(`/groups/${dv}/invite`, { target: s4 }, "kk1")).s, 200); // freed a slot
  const inv = (await get("/groups/mine", "kk2")).invitesIn; a.equal(inv.length, 1); a.equal(inv[0].by, "kk1"); a.equal(inv[0].members.length, 2);
  a.equal((await post(`/invites/${inv[0].id}/accept`, {}, "kk2")).s, 200); // fills the 3rd seat
  a.equal((await get("/groups/mine", "kk4")).invitesIn.length, 0); // other invite auto-deleted
  const gm = (await get("/groups/mine", "kk2")).groups.filter(x => x.date === d); a.equal(gm.length, 1); a.equal(gm[0].members.length, 3); a.equal(gm[0].id, dv); // own solo listing replaced
  a.equal((await post(`/groups/${dv}/invite`, { target: s4 }, "kk1")).s, 409); // full
  a.equal((await post(`/invites/${inv[0].id}/accept`, {}, "kk3")).s, 404);
});
t("girls-only stays among girls", async () => {
  a.equal((await post("/groups", P({ sources: ["Boys A"], girlsOnly: true }), "sana")).s, 400);
  a.equal((await post("/groups", P({ sources: ["Girls B"], girlsOnly: true, date: day(4) }), "sana")).s, 201);
  a.equal((await get(Q({ date: day(4), girlsOnly: "true" }), "tara")).groups.length, 1);
  a.equal((await get(Q({ date: day(4) }), "amit")).groups.length, 0);
});
t("edit: solo changes anything, grouped only own window; messages say joined/left", async () => {
  a.equal((await patch(`/groups/${gid}`, P({ time: "10:10", timeTo: "10:25" }), "amit")).s, 403); // grouped people can't change personal plans
  a.equal((await patch(`/groups/${gid}/settings`, { time: "10:10", timeTo: "10:25", size: 3, vehicle: "Any" }, "tara")).s, 404); // outsiders can't
  a.equal((await patch(`/groups/${gid}/settings`, { time: "10:10", timeTo: "10:25", size: 2, vehicle: "Any" }, "amit")).s, 400); // size 3 or 4 only
  a.equal((await patch(`/groups/${gid}/settings`, { time: "10:10", timeTo: "10:25", size: 3, vehicle: "Any" }, "ravi")).s, 200); // any member can change group settings
  const g = (await get("/groups/mine", "amit")).groups[0]; a.equal(g.dest, "Katpadi Railway Station"); a.equal(g.time, "10:10"); a.equal(g.timeTo, "10:25"); a.equal(g.vehicle, "Any");
  const sm = (await get(`/groups/${gid}/messages`, "amit")).messages; a.equal(sm[0].type, "system"); a.equal(sm[0].text, "joined"); a.equal(sm[0].senderUsername, "ravi"); a.equal(sm[sm.length - 1].text, "updated");
  const so = await post("/groups", P({ date: day(12) }), "tara"); const id = so.group.id;
  a.equal((await patch(`/groups/${id}`, P({ date: day(13), dest: "Old Bus Stand", dir: "to" }), "tara")).s, 200);
  const e = (await get("/groups/mine", "tara")).groups.find(x => x.id === id); a.equal(e.dest, "Old Bus Stand"); a.equal(e.dir, "to"); a.equal(e.date, day(13));
});
t("confirm needs 2; leaving wipes chat and returns to a solo listing", async () => {
  a.equal((await post(`/groups/${gid}/confirm`, {}, "amit")).s, 200);
  a.equal((await post(`/groups/${gid}/leave`, {}, "ravi")).s, 200);
  const m = (await get(`/groups/${gid}/messages`, "amit")).messages; a.equal(m.length, 1); a.equal(m[0].text, "left"); a.equal(m[0].senderUsername, "ravi");
  const g = (await get("/groups/mine", "amit")).groups.find(x => x.id === gid); a.equal(g.solo, true); a.equal(g.confirmed, false); a.equal(g.code, "");
  a.equal((await post(`/groups/${gid}/confirm`, {}, "amit")).s, 400); a.equal((await get(`/groups/${gid}/messages`, "tara")).s, 403);
});
t("window limits, block/report, fares by pickup, delete account", async () => {
  a.equal((await post("/groups", P({ date: day(45) }), "tara")).s, 400);
  a.equal((await post(`/users/${ids.amit}/block`, {}, "tara")).s, 200); a.equal((await post(`/users/${ids.amit}/report`, { reason: "x" }, "tara")).s, 200);
  a.equal((await get(Q({}), "tara")).groups.length, 0); // blocked users are hidden
  const f = (await get("/groups/mine", "amit")).groups[0].fares; a.equal(f.length, 5); a.equal(f.find(x => x.name === "Maya Call Taxi").price, 250);
  a.equal((await fetch(base + "/me", { method: "DELETE", headers: { authorization: "Bearer " + tok.ravi } })).status, 200); a.equal((await get("/groups/mine", "ravi")).groups.length, 0);
});
t("opens without sign-in: device profile, Boys/Girls switch, can be turned off", async () => {
  const g1 = await post("/guest", {}); a.equal(g1.s, 200); a.equal(g1.user.guest, true); a.match(g1.user.username, /^Guest\d+/); tok.g1 = g1.token;
  const me = await get("/me", "g1"); a.equal(me.s, 200); a.equal(me.user.id, g1.user.id); a.equal(me.user.guest, true);
  a.notEqual((await post("/guest", {})).user.id, g1.user.id); // every device gets its own profile
  a.equal((await patch("/me", { gender: "female" }, "g1")).user.gender, "female"); a.equal((await patch("/me", { gender: "x" }, "g1")).s, 400);
  a.equal((await post("/groups", P({ date: day(20), sources: ["Girls B"] }), "g1")).s, 201); // now a girl: girls' hostels work
  a.equal((await patch("/me", { gender: "male" }, "g1")).s, 409); // can't switch while on a trip
  a.equal((await patch("/me", { gender: "female" }, "amit")).s, 403); // main-app accounts are not editable here
  process.env.ALLOW_GUESTS = "false"; const off = await post("/guest", {}); delete process.env.ALLOW_GUESTS; a.equal(off.s, 403); // switch off at integration time
});
t("live chat over websocket + expired groups are swept", async () => {
  const { io } = require("socket.io-client"), url = base.replace("/api", ""), g = (await get("/groups/mine", "amit")).groups[0], c = io(url, { auth: { token: tok.amit }, transports: ["websocket"] });
  await new Promise(r => c.on("connect", r)); c.emit("join_room", g.id); await new Promise(r => setTimeout(r, 300));
  const got = new Promise(r => c.on("new_message", r)); c.emit("send_message", { groupId: g.id, text: "hello team", cid: "c1" });
  const m = await got; a.equal(m.text, "hello team"); a.equal(m.cid, "c1"); c.close();
  await P_POOL.query("UPDATE groups SET expires_at = now() - interval '1 hour' WHERE id=$1", [g.id]); await S.sweep();
  a.equal((await get("/groups/mine", "amit")).groups.length, 0);
});
