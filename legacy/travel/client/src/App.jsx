import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { api, getSocket } from "./api";
import { GIRLS, BOYS, DESTS, DEST_ADDR, PLACE_LL, trainName } from "./data";

const today = () => new Date(Date.now() + 330 * 6e4).toISOString().slice(0, 10), addDays = n => new Date(Date.now() + 330 * 6e4 + n * 864e5).toISOString().slice(0, 10);
const isBlk = s => /^(Girls|Boys) /.test(s), E = e => e.response?.data?.error || "Something went wrong", vlabel = v => (v === "Any" ? "Cab / Auto" : v);
const hm = d => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), HOME = { app: 1, tab: "plan" }, MAIN = (import.meta.env.VITE_MAIN_APP_URL || "").trim();
const readUser = () => { try { return localStorage.getItem("travel_token") ? JSON.parse(localStorage.getItem("travel_user")) : null; } catch { return null; } };
const trainLabel = t => (t ? `${t}${trainName(t) ? " · " + trainName(t) : ""}` : "No train entered");
const DEF = { dir: "from", sources: [], dest: "", vehicle: "Any", size: 4, girlsOnly: false, date: today(), time: "14:00", timeTo: "15:00", train: "" };
const loadDraft = id => { try { const d = { ...DEF, ...JSON.parse(localStorage.getItem("travel_draft" + id)) }; if (d.date < today()) d.date = today(); return d; } catch { return { ...DEF }; } };
const routeOf = g => (g.dir === "to" ? `${g.dest} → ${g.pickup}` : `${g.pickup} → ${g.dest}`);
const sysText = (m, me) => { const n = String(m.senderId) === String(me) ? "You" : m.senderUsername; return ({ joined: `${n} joined`, left: `${n} left the group`, confirmed: `${n} confirmed the group — time to book!`, updated: `${n} updated the group settings` })[m.text] || m.text; };
const SITES = { "Maya Call Taxi": "https://www.mayacalltaxi.com/", "Red Taxi": "https://www.redtaxi.co.in/", Ola: "https://www.olacabs.com/", Rapido: "https://www.rapido.bike/" };
const placeAddr = p => (p === "Main Gate" ? "VIT University Main Gate, Vellore" : p === "RJT" ? "RJT, VIT University, Vellore" : `${p.split(" ")[0]} Hostel Block ${p.split(" ")[1]}, VIT University, Vellore`);
const canNotify = () => typeof Notification !== "undefined";

function Member({ m, mine }) {
  const [o, setO] = useState(false), [n, setN] = useState("");
  const act = async k => { try { await api.post(`/users/${m.id}/${k}`, { reason: "Reported from group" }); setN(k === "block" ? "Blocked" : "Reported"); } catch (x) { setN(E(x)); } };
  return <span><button className="chip" onClick={() => setO(!o)} aria-expanded={o}>{m.username}{m.block ? <small> · {m.block}</small> : null}</button>
    {o && <div className="card muted pop">🕒 {m.time} – {m.timeTo}<br />🚆 {trainLabel(m.train)}<div className="row">{!mine && <><button onClick={() => act("report")}>Report</button><button onClick={() => act("block")}>Block</button></>}{n}</div></div>}</span>;
}

function Plan({ user, setGender, editing, onCreated, onNew, toast, reload }) {
  const [p, setP] = useState(() => loadDraft(user.id)), [res, setRes] = useState(null), [msg, setMsg] = useState(""), [open, setOpen] = useState(false), girl = user.gender === "female";
  const me = editing?.members.find(m => m.id === user.id), locked = !!editing && editing.members.length > 1;
  const set = (k, v) => setP(s => ({ ...s, [k]: v })), blocks = girl ? GIRLS.map(b => "Girls " + b) : BOYS.map(b => "Boys " + b);
  useEffect(() => { if (editing && me) setP({ dir: editing.dir, sources: me.sources, dest: editing.dest, vehicle: editing.vehicle, size: editing.rawSize, girlsOnly: editing.girlsOnly, date: editing.date, time: me.time, timeTo: me.timeTo, train: me.train || "" }); }, [editing?.id]);
  const g0 = useRef(user.gender); useEffect(() => { if (g0.current !== user.gender) { g0.current = user.gender; setP(x => ({ ...x, sources: x.sources.filter(v => !isBlk(v)), girlsOnly: false })); } }, [user.gender]); // other hostel list after switching
  useEffect(() => { localStorage.setItem("travel_draft" + user.id, JSON.stringify(p)); }, [p]); // survives refresh until cleared
  const toggle = s => setP(x => { let a = x.sources.includes(s) ? x.sources.filter(y => y !== s) : [...x.sources, s];
    if (isBlk(s)) a = a.filter(y => !isBlk(y) || y === s); if (s === "RJT") a = a.filter(y => y === "RJT" || y === "Main Gate"); if (a.length > 2) a = a.slice(-2); return { ...x, sources: a }; });
  const q = () => ({ ...p, size: Number(p.size) }), key = JSON.stringify([p.dir, p.dest, p.date, p.time, p.timeTo, p.vehicle, p.size, p.girlsOnly, p.train]);
  const seq = useRef(0);
  const search = useCallback(async () => { const id = ++seq.current; if (!p.dest) return setRes(null);
    try { const { data } = await api.get("/groups/search", { params: q(), paramsSerializer: { indexes: null } }); if (id === seq.current) { setRes(data.groups); setMsg(""); } }
    catch (x) { if (id === seq.current) { setMsg(E(x)); setRes(null); } } }, [key]); // only the latest answer is shown
  const sr = useRef(); sr.current = search;
  useEffect(() => { const t = setTimeout(search, 300); return () => clearTimeout(t); }, [search]); // results follow every change
  useEffect(() => { let t; const h = () => { clearTimeout(t); t = setTimeout(() => sr.current(), 400); }; const s = getSocket(); s.on("groups_changed", h); return () => { clearTimeout(t); s.off("groups_changed", h); }; }, []);
  const tm = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const fits = g => g.date === p.date && g.dest === p.dest && g.dir === p.dir && (g.vehicle === "Any" || p.vehicle === "Any" || g.vehicle === p.vehicle) && (!p.girlsOnly || g.girlsOnly)
    && !(Number(p.size) && g.rawSize && Number(p.size) !== g.rawSize) && tm(g.time) <= tm(p.time) + (tm(p.timeTo) - tm(p.time)) && tm(p.time) <= tm(g.time) + g.flex; // mirrors the server rules so the list reacts instantly
  const shown = res && res.filter(fits);
  const save = async () => { setMsg(""); try { if (editing) { await api.patch(`/groups/${editing.id}`, q()); toast("Saved"); await reload(); } else { const { data } = await api.post("/groups", q()); await reload(); onCreated(data.group.id); toast("Trip created"); } search(); } catch (x) { setMsg(E(x)); } };
  const clear = () => { localStorage.removeItem("travel_draft" + user.id); setP({ ...DEF, date: today() }); setRes(null); setMsg(""); onNew(); };
  const join = async g => { try { await api.post(`/groups/${g.id}/join`, q()); setRes(r => r && r.map(y => (y.id === g.id ? { ...y, requested: true } : y))); toast("Request sent"); reload(); } catch (x) { setMsg(E(x)); } };
  const Chip = ({ s, label }) => <button type="button" disabled={false} aria-pressed={p.sources.includes(s)} className={p.sources.includes(s) ? "sel" : ""} onClick={() => toggle(s)}>{label || s}</button>;
  const vit = <><div className="chips"><Chip s="Main Gate" /><Chip s="RJT" /><button type="button" className={open ? "sel" : ""} onClick={() => setOpen(!open)}>{girl ? "Girls hostel" : "Boys hostel"} ▾</button></div>
    {open && <div className="chips" style={{ marginTop: 6 }}>{blocks.map(s => <Chip key={s} s={s} label={s.split(" ")[1]} />)}</div>}<p className="muted">{p.sources.join(" + ") || "Main Gate / hostel block"}</p></>;
  const ext = <select aria-label="Place" value={p.dest} disabled={locked} onChange={e => set("dest", e.target.value)}><option value="">Select…</option>{DESTS.map(d => <option key={d}>{d}</option>)}</select>;
  return <section className="card"><div className="hero small">Welcome, {user.username}!</div>
    {user.guest && !editing && <div className="seg" role="group" aria-label="I am">{[["male", "Boys"], ["female", "Girls"]].map(([v, l]) => <button key={v} aria-pressed={user.gender === v} className={user.gender === v ? "sel" : ""} onClick={() => user.gender !== v && setGender(v)}>{l}</button>)}</div>}<h2>🚗 {editing ? "Your trip" : "Plan your trip"}</h2>
    {girl && <label className="row girl"><input style={{ width: "auto" }} type="checkbox" disabled={locked} checked={p.girlsOnly} onChange={e => set("girlsOnly", e.target.checked)} /> 💗 Girls-only travel</label>}
    <div className="route"><div><label>From</label>{p.dir === "from" ? vit : ext}</div>
      <button type="button" className="swap" disabled={locked} onClick={() => set("dir", p.dir === "from" ? "to" : "from")} aria-label="Swap from and to">⇅</button>
      <div><label>To</label>{p.dir === "from" ? ext : vit}</div></div>
    <div className="row"><div style={{ flex: 1 }}><label htmlFor="v">Vehicle</label><select id="v" value={p.vehicle} disabled={locked} onChange={e => set("vehicle", e.target.value)}><option value="Any">Cab / Auto</option><option>Cab</option><option>Auto</option></select></div>
      <div style={{ flex: 1 }}><label htmlFor="s">Group size</label><select id="s" value={p.size} disabled={locked} onChange={e => set("size", e.target.value)}><option value={3}>3</option><option value={4}>4</option><option value={0}>Any</option></select></div></div>
    <label htmlFor="dt">Date</label><input id="dt" type="date" min={today()} max={addDays(30)} disabled={locked} value={p.date} onChange={e => set("date", e.target.value)} />
    <div className="row"><div style={{ flex: 1 }}><label htmlFor="t1">Earliest departure</label><input id="t1" type="time" value={p.time} onChange={e => setP(x => ({ ...x, time: e.target.value, timeTo: x.timeTo < e.target.value ? e.target.value : x.timeTo }))} /></div>
      <div style={{ flex: 1 }}><label htmlFor="t2">Latest departure</label><input id="t2" type="time" min={p.time} value={p.timeTo} onChange={e => set("timeTo", e.target.value)} /></div></div>
    <label htmlFor="tr">Train number (optional)</label><input id="tr" inputMode="numeric" maxLength={5} value={p.train} onChange={e => set("train", e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="e.g. 12607" />
    {p.train.length === 5 && trainName(p.train) && <p className="muted">🚆 {trainName(p.train)}</p>}
    {msg && <p className="err" role="alert">{msg}</p>}
    <div className="row" style={{ marginTop: 10 }}><button className="p grow" onClick={save}>{editing ? "Save changes" : "Create travel plan"}</button><button onClick={clear}>{editing ? "New trip" : "Clear"}</button></div>
    {shown && (shown.length === 0 ? <p className="muted">No matches yet</p> : shown.map(g => <div className="card gcard" key={g.id} style={{ marginTop: 10 }}>
      <div className="ghead"><b>{g.time} – {g.timeTo}</b><span className="muted">{vlabel(g.vehicle)}{g.girlsOnly ? " · 💗" : ""}</span>{g.trainMatch && <span className="ok">🚆 same train</span>}</div>
      <div className="muted">{routeOf(g)}{!g.solo && ` · ${g.seatsLeft} seat${g.seatsLeft > 1 ? "s" : ""} left`}</div>
      <div className="chips">{g.members.map(m => <Member key={m.id} m={m} />)}</div>
      <button className="p full" disabled={g.requested} onClick={() => join(g)}>{g.requested ? "Requested ✓" : "Request to join"}</button></div>))}
  </section>;
}

function GroupView({ g, me, reload, toast, ask, goBook, onEdit }) {
  const [msgs, setMsgs] = useState([]), [t, setT] = useState(""), [typers, setTypers] = useState({}), box = useRef(), lastTy = useRef(0), timers = useRef({});
  const load = useCallback(() => api.get(`/groups/${g.id}/messages`).then(r => setMsgs(r.data.messages)).catch(() => {}), [g.id]);
  useEffect(() => { setMsgs([]); setTypers({}); const s = getSocket(); s.emit("join_room", g.id); load();
    const clr = u => { clearTimeout(timers.current[u]); setTypers(x => { const y = { ...x }; delete y[u]; return y; }); };
    const nm = m => { if (String(m.groupId) !== String(g.id)) return; if (m.type !== "system" && m.senderUsername) clr(m.senderUsername);
      setMsgs(x => (m.cid && x.some(y => y.cid === m.cid) ? x.map(y => (y.cid === m.cid ? m : y)) : x.some(y => y._id === m._id) ? x : [...x, m])); };
    const up = () => load(), ty = d => { if (String(d.groupId) !== String(g.id)) return; setTypers(x => ({ ...x, [d.username]: 1 })); clearTimeout(timers.current[d.username]); timers.current[d.username] = setTimeout(() => clr(d.username), 3000); };
    s.on("new_message", nm); s.on("group_updated", up); s.on("typing", ty);
    return () => { s.off("new_message", nm); s.off("group_updated", up); s.off("typing", ty); }; }, [g.id]);
  useLayoutEffect(() => { const b = box.current; if (b) b.scrollTop = b.scrollHeight; }, [msgs, typers]);
  const send = e => { e.preventDefault(); const x = t.trim(); if (!x) return; const cid = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random());
    setMsgs(m => [...m, { _id: cid, cid, groupId: g.id, type: "message", senderId: me, text: x, createdAt: new Date().toISOString() }]); getSocket().emit("send_message", { groupId: g.id, text: x, cid }); setT(""); };
  const onType = e => { setT(e.target.value); if (Date.now() - lastTy.current > 1500) { lastTy.current = Date.now(); getSocket().emit("typing", g.id); } };
  const post = async (url, after) => { try { await api.post(url); await reload(); after && after(); } catch (x) { toast(E(x)); } };
  const names = Object.keys(typers), live = g.members.length >= 2;
  return <div className="gview">
    <div className="gtop"><div className="ghead">{live && <span className="badge">{g.code}</span>}<b>{routeOf(g)}</b><span className="grow" />
        <button className="sm" onClick={() => onEdit(g.id)}>{live ? "Settings" : "Edit"}</button>
        <button className="sm" onClick={() => ask(live ? { title: "Leave group?", text: "You'll be removed from this group.", okLabel: "Leave", ok: () => post(`/groups/${g.id}/leave`) } : { title: "Cancel trip?", text: "Your listing will be removed.", okLabel: "Cancel trip", ok: () => post(`/groups/${g.id}/leave`) })}>{live ? "Exit" : "Cancel"}</button></div>
      <p className="muted" style={{ margin: "4px 0" }}>{g.date} · {g.time} – {g.timeTo} · {vlabel(g.vehicle)}{g.girlsOnly ? " · 💗" : ""}{live ? ` · ${g.seatsLeft > 0 ? `${g.seatsLeft} seat${g.seatsLeft > 1 ? "s" : ""} left` : "full"}` : ""}</p>
      <div className="chips">{g.members.map(m => <Member key={m.id} m={m} mine={m.id === me} />)}</div></div>
    {live ? <><div className="chat" ref={box} role="log" aria-live="polite">{msgs.map(m => m.type === "system" ? <div className="sys" key={m._id}><span>{sysText(m, me)}</span></div> :
        <div key={m._id} className={"msg " + (String(m.senderId) === String(me) ? "me" : "them")}>{String(m.senderId) !== String(me) && <div className="who">{m.senderUsername}</div>}{m.text}<small>{hm(m.createdAt)}</small></div>)}</div>
      <div className="typing" aria-live="polite">{names.length ? `${names.join(", ")} ${names.length > 1 ? "are" : "is"} typing…` : ""}</div>
      <form className="row nowrap" onSubmit={send}><input aria-label="Message" style={{ flex: 1, borderRadius: 20 }} value={t} onChange={onType} maxLength={1000} placeholder="Type a message" /><button className="p" style={{ borderRadius: 20 }}>Send</button></form></>
      : <div className="empty card muted">{g.requests.length ? "You have requests — open Requests" : "Listed — waiting for requests"}</div>}
    <div className="row nowrap"><button className="p grow" disabled={g.confirmed || !live} onClick={() => post(`/groups/${g.id}/confirm`, () => { toast("Group confirmed 🎉"); goBook(); })}>{g.confirmed ? "Group confirmed ✓" : "Confirm group"}</button>
      <button className="grow" disabled={!g.confirmed} onClick={goBook}>🚕 Book ride</button></div></div>;
}

const tmin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
function GroupSettings({ g, toast, reload, back }) {
  const [s, setS] = useState({ time: g.time, timeTo: g.timeTo, size: g.rawSize || 4, vehicle: g.vehicle }), [res, setRes] = useState(null), [msg, setMsg] = useState(""), seq = useRef(0), key = JSON.stringify(s), off = g.confirmed;
  const search = useCallback(async () => { const id = ++seq.current;
    try { const { data } = await api.get("/groups/search", { params: { groupId: g.id, ...s, size: Number(s.size) } }); if (id === seq.current) { setRes(data.groups); setMsg(""); } } catch (x) { if (id === seq.current) { setMsg(E(x)); setRes(null); } } }, [key, g.id]);
  const sr = useRef(); sr.current = search;
  useEffect(() => { const t = setTimeout(search, 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { const h = () => sr.current(), sk = getSocket(); sk.on("groups_changed", h); return () => sk.off("groups_changed", h); }, []);
  const fits = x => (x.vehicle === "Any" || s.vehicle === "Any" || x.vehicle === s.vehicle) && !(x.rawSize && Number(s.size) !== x.rawSize) && tmin(x.time) <= tmin(s.timeTo) && tmin(s.time) <= tmin(x.time) + x.flex;
  const shown = res && res.filter(fits);
  const save = async () => { try { await api.patch(`/groups/${g.id}/settings`, { ...s, size: Number(s.size) }); toast("Saved"); await reload(); search(); } catch (x) { setMsg(E(x)); } };
  const invite = async x => { try { await api.post(`/groups/${g.id}/invite`, { target: x.id }); setRes(r => r && r.map(y => (y.id === x.id ? { ...y, requested: true } : y))); toast("Invite sent"); reload(); } catch (e) { setMsg(E(e)); } };
  return <section className="card"><h2>⚙️ Group settings</h2><p className="muted">{g.code} · {routeOf(g)} · {g.date} · {g.seatsLeft} seat{g.seatsLeft === 1 ? "" : "s"} left</p>
    <div className="row"><div style={{ flex: 1 }}><label htmlFor="g1">Earliest departure</label><input id="g1" type="time" disabled={off} value={s.time} onChange={e => setS(x => ({ ...x, time: e.target.value, timeTo: x.timeTo < e.target.value ? e.target.value : x.timeTo }))} /></div>
      <div style={{ flex: 1 }}><label htmlFor="g2">Latest departure</label><input id="g2" type="time" disabled={off} min={s.time} value={s.timeTo} onChange={e => setS(x => ({ ...x, timeTo: e.target.value }))} /></div></div>
    <div className="row"><div style={{ flex: 1 }}><label htmlFor="g3">Transport</label><select id="g3" disabled={off} value={s.vehicle} onChange={e => setS(x => ({ ...x, vehicle: e.target.value }))}><option value="Any">Cab / Auto</option><option>Cab</option><option>Auto</option></select></div>
      <div style={{ flex: 1 }}><label htmlFor="g4">Group size</label><select id="g4" disabled={off} value={s.size} onChange={e => setS(x => ({ ...x, size: e.target.value }))}><option value={3}>3</option><option value={4}>4</option></select></div></div>
    {msg && <p className="err" role="alert">{msg}</p>}
    <div className="row" style={{ marginTop: 10 }}><button className="p grow" disabled={off} onClick={save}>Save changes</button><button onClick={back}>Back</button></div>
    {shown && shown.length > 0 && <h3 style={{ marginBottom: 0 }}>Invite people</h3>}
    {shown && shown.map(x => <div className="card gcard" key={x.id} style={{ marginTop: 10 }}>
      <div className="ghead"><b>{x.time} – {x.timeTo}</b><span className="muted">{vlabel(x.vehicle)}{x.girlsOnly ? " · 💗" : ""}</span>{x.trainMatch && <span className="ok">🚆 same train</span>}</div>
      <div className="chips">{x.members.map(m => <Member key={m.id} m={m} />)}</div>
      <button className="p full" disabled={x.requested || off} onClick={() => invite(x)}>{x.requested ? "Invited ✓" : "Invite"}</button></div>)}
  </section>;
}

function Requests({ groups, outgoing, invitesIn, reload, toast }) {
  const act = url => api.post(url).then(reload).catch(x => toast(E(x))), recv = groups.flatMap(g => g.requests.map(r => ({ ...r, g }))), sent = groups.flatMap(g => g.invited.map(i => ({ ...i, g })));
  const Btns = ({ no, yes }) => <div className="row"><button onClick={() => act(no)}>Decline</button><button className="p" onClick={() => act(yes)}>Accept</button></div>;
  if (!recv.length && !invitesIn.length && !outgoing.length && !sent.length) return <p className="card muted">Nothing here</p>;
  return <>{(recv.length > 0 || invitesIn.length > 0) && <section className="card"><h3>Received</h3>
      {invitesIn.map(v => <div className="rq" key={"i" + v.id}><div><b>{v.by}</b> invited you{v.code ? ` to ${v.code}` : ""}<div className="muted">{routeOf(v)} · {v.date} · {v.time}–{v.timeTo}<br />{v.members.map(m => m.username + (m.block ? ` (${m.block})` : "")).join(", ")}</div></div><Btns no={`/invites/${v.id}/decline`} yes={`/invites/${v.id}/accept`} /></div>)}
      {recv.map(r => <div className="rq" key={"r" + r.id}><div><b>{r.username}</b> wants to join{r.g.code ? ` ${r.g.code}` : " your trip"}<div className="muted">{r.hostel || "—"} · {r.time}–{r.timeTo} · 🚆 {trainLabel(r.train)}</div></div><Btns no={`/requests/${r.id}/reject`} yes={`/requests/${r.id}/accept`} /></div>)}</section>}
    {(outgoing.length > 0 || sent.length > 0) && <section className="card"><h3>Sent</h3>
      {outgoing.map(r => <div className="rq" key={"o" + r.id}><div>To <b>{r.to.join(", ")}</b>{r.code ? ` · ${r.code}` : ""}<div className="muted">{r.dest} · {r.date} · {r.time}–{r.timeTo}</div></div><button onClick={() => act(`/requests/${r.id}/cancel`)}>Cancel</button></div>)}
      {sent.map(i => <div className="rq" key={"s" + i.id}><div>Invited <b>{i.username}</b><div className="muted">by {i.by} · {i.g.code}</div></div><button onClick={() => act(`/invites/${i.id}/cancel`)}>Cancel</button></div>)}</section>}</>;
}

function Book({ groups, toast }) {
  const cg = groups.filter(g => g.confirmed), [i, setI] = useState(0), g = cg[Math.min(i, cg.length - 1)];
  if (!g) return <p className="card muted">Confirm a group to book a ride</p>;
  const n = g.members.length, from = g.dir !== "to", vit = placeAddr(g.pickup), ext = DEST_ADDR[g.dest], A = from ? vit : ext, B = from ? ext : vit;
  const label = g.pickup === "Main Gate" ? "VIT Main Gate" : g.pickup, an = from ? label : g.dest, bn = from ? g.dest : label;
  const trip = `Pickup: ${A} → Drop: ${B} · ${g.date} ${g.time}–${g.timeTo} · ${n} riders`;
  const uber = "https://m.uber.com/ul/?" + new URLSearchParams({ action: "setPickup", "pickup[nickname]": an, "pickup[formatted_address]": A, "dropoff[nickname]": bn, "dropoff[formatted_address]": B });
  const fromLL = from ? PLACE_LL.vit : PLACE_LL[g.dest], toLL = from ? PLACE_LL[g.dest] : PLACE_LL.vit;
  const ola = "https://olawebcdn.com/assets/ola-universal-link.html?" + new URLSearchParams({ landing_page: "bk", ...(fromLL && { lat: fromLL[0], lng: fromLL[1] }), ...(toLL && { drop_lat: toLL[0], drop_lng: toLL[1] }) });
  const open = name => { navigator.clipboard?.writeText(trip).catch(() => {}); toast(name === "Uber" || name === "Ola" ? `Opening ${name}…` : "Trip details copied"); window.open(name === "Uber" ? uber : name === "Ola" ? ola : SITES[name], "_blank", "noopener"); };
  return <section className="card"><h2>🚕 Book your ride</h2>
    {cg.length > 1 && <div className="chips" style={{ marginBottom: 8 }}>{cg.map((x, k) => <button key={x.id} className={k === i ? "sel" : ""} onClick={() => setI(k)}>{x.code} · {x.dest}</button>)}</div>}
    <p className="muted">{routeOf(g)}<br />{g.date} · {g.time} – {g.timeTo} · {n} riders</p>
    {g.vehicle === "Auto" ? <p>Book an auto at the stand or gate</p> : <div className="tiles">{g.fares.map(f => <button key={f.name} className="tile" onClick={() => open(f.name)}><b>{f.name}</b><span>≈ ₹{f.price}</span><small>₹{(f.price / n).toFixed(2)} each</small></button>)}</div>}</section>;
}

export default function App() {
  const [user, setUser] = useState(readUser), [groups, setGroups] = useState([]), [outgoing, setOutgoing] = useState([]), [invitesIn, setInvitesIn] = useState([]), [unread, setUnread] = useState({}), [toasts, setToasts] = useState([]), [askBox, setAsk] = useState(null), [gsel, setGsel] = useState(null), [editId, setEditId] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem("travel_theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  const [nav, setNav] = useState(() => (history.state?.app ? history.state : HOME)), [authErr, setAuthErr] = useState(""), [tries, setTries] = useState(0), [perm, setPerm] = useState(canNotify() ? Notification.permission : "denied");
  const editing = groups.find(g => g.id === editId), R = useRef({}); const active = groups.find(g => g.id === gsel) || groups[0]; R.current = { nav, active, groups };
  useEffect(() => { history.replaceState(nav, ""); const pop = e => setNav(e.state?.app ? e.state : HOME); addEventListener("popstate", pop); return () => removeEventListener("popstate", pop); }, []);
  const go = n => { const nx = { ...nav, ...n }; history.pushState(nx, ""); setNav(nx); };
  useEffect(() => { document.documentElement.dataset.theme = theme; document.documentElement.dataset.app = "travel"; localStorage.setItem("travel_theme", theme); }, [theme]);
  const toast = useCallback(m => { const id = Math.random(); setToasts(t => [...t, { id, m }]); setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500); }, []);
  const reload = useCallback(() => api.get("/groups/mine").then(r => { setGroups(r.data.groups); setOutgoing(r.data.outgoing); setInvitesIn(r.data.invitesIn || []); }).catch(() => {}), []);
  const soon = useRef(); const reloadSoon = useCallback(() => { clearTimeout(soon.current); soon.current = setTimeout(reload, 250); }, [reload]);
  useEffect(() => { // opens straight in: no sign-in screen. A real token from the main app is used if present; otherwise a profile for this device is created.
    const ok = u => { setUser(u); setAuthErr(""); localStorage.setItem("travel_user", JSON.stringify(u)); };
    const fail = x => { if (x.response?.status === 401) { localStorage.removeItem("travel_token"); localStorage.removeItem("travel_user"); return setTries(n => n + 1); }
      x.response ? setAuthErr(x.response.data?.error || "Sign-in failed") : setTimeout(() => setTries(n => n + 1), 3000); }; // no answer yet: server may be waking up
    if (localStorage.getItem("travel_token")) api.get("/me").then(r => ok(r.data.user)).catch(fail);
    else api.post("/guest").then(r => { localStorage.setItem("travel_token", r.data.token); ok(r.data.user); }).catch(fail); }, [tries]);
  useEffect(() => { if (!user) return; reload();
    const s = getSocket(), joinAll = () => R.current.groups.forEach(g => s.emit("join_room", g.id));
    const alert = (title, body) => { if (canNotify() && Notification.permission === "granted" && document.hidden) new Notification(title, { body }); };
    const onMsg = m => { const { nav: n, active: a } = R.current, viewing = n.tab === "mine" && a && String(a.id) === String(m.groupId) && !document.hidden;
      if (m.type === "system") { const tx = sysText(m, user.id); if (!viewing && String(m.senderId) !== String(user.id)) { toast(tx); alert("Go2Gether", tx); } return reloadSoon(); }
      if (String(m.senderId) === String(user.id) || viewing) return; setUnread(u => ({ ...u, [m.groupId]: (u[m.groupId] || 0) + 1 })); toast(`${m.senderUsername}: ${m.text}`); alert(m.senderUsername, m.text); };
    const onInv = d => { toast(`${d.by} invited you to a group`); alert("Group invite", `${d.by} invited you to a group`); reload(); };
    const onReq = d => { toast(`${d.username} wants to join your group`); alert("New join request", `${d.username} wants to join your group`); reload(); };
    const acc = () => { toast("You're in! Your request was accepted 🎉"); alert("Go2Gether", "Your request was accepted"); reload(); }, rej = () => { toast("A join request was declined"); reload(); };
    s.on("connect", joinAll); s.on("new_message", onMsg); s.on("join_request", onReq); s.on("invite_received", onInv); s.on("request_accepted", acc); s.on("request_rejected", rej); s.on("group_updated", reloadSoon); s.on("groups_changed", reloadSoon);
    return () => { ["connect", "new_message", "join_request", "invite_received", "request_accepted", "request_rejected", "group_updated", "groups_changed"].forEach(e => s.removeAllListeners(e)); }; }, [user?.id]);
  useEffect(() => { groups.forEach(g => getSocket().emit("join_room", g.id)); }, [groups.map(g => g.id).join()]);
  useEffect(() => { if (nav.tab === "mine" && active && unread[active.id]) setUnread(u => ({ ...u, [active.id]: 0 })); }, [nav.tab, active?.id, unread]);
  const setGender = g => api.patch("/me", { gender: g }).then(r => { setUser(r.data.user); localStorage.setItem("travel_user", JSON.stringify(r.data.user)); }).catch(x => toast(E(x)));
  const askNotify = () => Notification.requestPermission().then(setPerm);
  const badge = Object.values(unread).reduce((a, b) => a + b, 0), received = groups.reduce((a, g) => a + g.requests.length, 0) + invitesIn.length;
  const tab = k => { if (k === "plan" && editing && editing.members.length > 1) setEditId(null); nav.tab !== k && go({ tab: k }); };
  const cancelReq = id => api.post(`/requests/${id}/cancel`).then(reload).catch(x => toast(E(x)));
  let body;
  if (!user) body = <div className="content"><main><div className="card"><h2>🚗 Go2Gether</h2><p>{authErr || "Loading…"}</p>{MAIN && <a className="btn p" href={MAIN}>Open main app</a>}</div></main></div>;
  else body = <><div className="tabs">
      <button className={nav.tab === "plan" ? "p" : ""} onClick={() => tab("plan")}>Plan</button>
      <button className={nav.tab === "requests" ? "p" : ""} onClick={() => tab("requests")}>Requests{received > 0 && <small> ({received})</small>}</button>
      <button className={nav.tab === "mine" ? "p" : ""} onClick={() => tab("mine")}>My groups{badge > 0 && <> 💬<small>({badge})</small></>}</button>
      <button className={nav.tab === "book" ? "p" : ""} onClick={() => tab("book")}>Book ride</button></div>
    <div className={"content" + (nav.tab === "mine" ? " fill" : "")}>
      {nav.tab === "plan" && <main>{editing && editing.members.length > 1 ? <GroupSettings key={editing.id} g={editing} toast={toast} reload={reload} back={() => { setEditId(null); go({ tab: "mine" }); }} /> : <Plan user={user} setGender={setGender} toast={toast} reload={reload} editing={editing} onCreated={setEditId} onNew={() => setEditId(null)} />}</main>}
      {nav.tab === "requests" && <main><Requests groups={groups} outgoing={outgoing} invitesIn={invitesIn} reload={reload} toast={toast} /></main>}
      {nav.tab === "book" && <main><Book groups={groups} toast={toast} /></main>}
      {nav.tab === "mine" && <>{groups.length > 1 && <div className="chips sel-row">{groups.map(g => <button key={g.id} className={g.id === active.id ? "sel" : ""} onClick={() => setGsel(g.id)}>{g.code || "Trip"} · {g.dest.split(" ")[0]}{unread[g.id] ? ` (${unread[g.id]})` : ""}</button>)}</div>}
        {active ? <GroupView key={active.id} g={active} me={user.id} reload={reload} toast={toast} ask={setAsk} goBook={() => go({ tab: "book" })} onEdit={id => { setEditId(id); go({ tab: "plan" }); }} /> : <p className="card muted" style={{ margin: 12 }}>No groups yet</p>}</>}
    </div></>;
  return <div className="app"><header className="top"><span className="row nowrap"><a href="../index.html" className="hub-back">← Back to Campus Hub</a>{MAIN && <a className="ib" href={MAIN} aria-label="Back to main app" style={{ display: "grid", placeItems: "center", textDecoration: "none" }}>←</a>}<span className="logo" role="img" aria-label="Go2Gether">🚗</span></span><div className="row nowrap">
      {user && canNotify() && perm === "default" && <button className="ib" onClick={askNotify} aria-label="Turn on notifications">🔔</button>}
      <button className="ib" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle light/dark mode">{theme === "dark" ? "☀️" : "🌙"}</button></div></header>
    {body}
    <div className="toasts" aria-live="polite">{toasts.map(t => <div key={t.id} className="toast">{t.m}</div>)}</div>
    {askBox && <div className="modal" role="dialog" aria-modal="true"><div className="card"><h3>{askBox.title}</h3><p className="muted">{askBox.text}</p><div className="row"><button onClick={() => setAsk(null)}>Cancel</button><button className="p" onClick={() => { askBox.ok(); setAsk(null); }}>{askBox.okLabel || "Yes"}</button></div></div></div>}
  </div>;
}
