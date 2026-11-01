import { useEffect, useState, useCallback } from 'react';
import { supabase, SUPABASE_URL } from './supabase.js';
import { buildPrintPdf, imageToPdf, pagesInRange, plural, formatDateTime } from '@unihub/shared';
import { SheetViewer } from '@unihub/shared/src/SheetViewer.jsx';
import { ThemeToggle } from '@unihub/shared/src/ThemeToggle.jsx';
import { LegalPage, CookieBanner, useHashPage } from '@unihub/shared/src/Legal.jsx';

const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const rangeText = (f) => (f.ranges?.length ? 'pages ' + f.ranges.map((r) => (r.from === r.to ? r.from : `${r.from}-${r.to}`)).join(', ') : 'all pages');
/** Pages the shop must actually print for an order (ranges x copies, all files). */
const printedPages = (o) => o.order_files.reduce((n, f) => n + pagesInRange({ pages: f.pages, ranges: f.ranges }) * f.copies, 0);
const optText = (f) => `${f.color === 'bw' ? 'B&W' : 'Colour'}, ${f.sides} sided, ${f.layout}-in-1${f.layout > 1 ? ` ${f.arrangement}` : ''}, ${rangeText(f)}, ${f.copies === 1 ? '1 copy' : f.copies + ' copies'}${f.spiral ? ', spiral' : ''}`;
const typeOf = (n) => ({ pdf: 'PDF', docx: 'Word', pptx: 'PowerPoint', png: 'Image (PNG)', jpg: 'Image (JPG)', jpeg: 'Image (JPG)' })[n.split('.').pop().toLowerCase()] || 'File';
const Field = ({ label, children }) => <label className="field"><span className="lbl"><i aria-hidden="true" />{label}</span>{children}</label>;

async function fileBytes(path) {
  const sign = () => supabase.storage.from('print-files').createSignedUrl(path, 120); // short-lived link
  let { data, error } = await sign();
  if (error) { await supabase.auth.refreshSession(); ({ data, error } = await sign()); } // an expired sign-in is the usual cause
  if (error) {
    const { data: why, error: e2 } = await supabase.rpc('file_status', { p_path: path });
    if (e2) throw new Error('could not check the file. Check your connection and try again');
    if (why === 'missing') throw new Error('the file is not in storage. The upload never arrived or it was already deleted. Ask the student to upload again');
    if (why === 'denied') throw new Error('access was refused. Sign out, sign in again and retry. If it keeps happening, tell the admin');
    throw new Error(error.message);
  }
  const res = await fetch(data.signedUrl);
  if (!res.ok) throw new Error(`file download failed (${res.status})`);
  return res.arrayBuffer();
}

export default function App() {
  const legal = useHashPage();
  const [user, setUser] = useState(null), [shop, setShop] = useState(null), [tab, setTab] = useState('orders'), [err, setErr] = useState('');
  useEffect(() => { supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null)); const { data } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null)); return () => data.subscription.unsubscribe(); }, []);
  useEffect(() => { if (!user) return setShop(null);
    supabase.from('shop_owners').select('shop_id, shops(*)').eq('user_id', user.id).single().then(({ data, error }) => (error ? setErr('This account is not linked to a shop.') : setShop(data.shops))); }, [user]);

  if (legal) return <LegalPage id={legal} />;
  if (!user) return <Login />;
  if (!shop) return <main><section className="card"><p role="alert" className="err">{err || 'Loading…'}</p><button className="ghost" onClick={() => supabase.auth.signOut()}>Sign out</button></section></main>;
  return <main><header className="hero"><ThemeToggle /><h1>{shop.name}</h1><p>Owner dashboard</p></header>
    <div className="nav" role="tablist">{[['orders', '📋 Queue'], ['settings', '⚙️ Shop settings'], ['prices', '💰 Prices'], ['chat', '💬 Chat']].map(([k, l]) =>
      <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
    {tab === 'orders' && <Orders shop={shop} />}{tab === 'settings' && <Settings shop={shop} setShop={setShop} />}
    {tab === 'prices' && <Prices shop={shop} setShop={setShop} />}{tab === 'chat' && <Chat shop={shop} />}
    <button className="ghost" onClick={() => supabase.auth.signOut()}>Sign out</button><CookieBanner /></main>;
}

function Login() {
  const [shops, setShops] = useState([]), [shopId, setShopId] = useState(''), [email, setEmail] = useState(''), [pw, setPw] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { supabase.from('shops').select('id,name').order('name').then(({ data, error }) => {
    if (error || !data?.length) setErr(!SUPABASE_URL ? 'Setup missing: open config.js next to index.html and paste your Supabase URL and anon key.' : `Could not load the shops (${error?.message || 'no shops found'}). Check that supabaseUrl in config.js is exactly your Project URL (https://xxxx.supabase.co) and the project is not paused.`); else setShops(data); }); }, []);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) { setErr('Sign-in failed. Check your email and password.'); return setBusy(false); }
    // The chosen shop must be the one this account is linked to.
    const { data: link, error: linkErr } = await supabase.from('shop_owners').select('shop_id').eq('user_id', data.user.id).maybeSingle();
    if (linkErr) { setErr('Signed in, but could not verify your shop. Check your connection and try again.'); return setBusy(false); }
    if (link?.shop_id !== shopId) { await supabase.auth.signOut(); setErr('This account does not belong to the shop you selected.'); }
    setBusy(false);
  }
  return <main><header className="hero"><ThemeToggle /><h1>UniHub Print Owner</h1></header><form className="card" onSubmit={submit}><h2><span aria-hidden="true">🔐 </span>Owner sign in</h2>
    <Field label="Your shop"><select value={shopId} onChange={(e) => setShopId(e.target.value)} required><option value="">Choose your shop</option>{shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
    <Field label="Email"><input type="email" autoComplete="username" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
    <Field label="Password"><input type="password" autoComplete="current-password" placeholder="Your password" value={pw} onChange={(e) => setPw(e.target.value)} required /></Field>
    {err && <p role="alert" className="err">{err}</p>}<button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in to dashboard'}</button></form><CookieBanner /></main>;
}

function Orders({ shop }) {
  const [orders, setOrders] = useState([]), [msg, setMsg] = useState(''), [openId, setOpenId] = useState(null), [sheets, setSheets] = useState(null), [busy, setBusy] = useState('');
  const load = useCallback(async () => { const { data, error } = await supabase.from('orders').select('*, order_files(*)').eq('shop_id', shop.id).eq('status', 'preparing').order('created_at');
    if (error) setMsg('Could not load orders.'); else setOrders(data); }, [shop.id]);
  useEffect(() => { load(); const ch = supabase.channel('q').on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `shop_id=eq.${shop.id}` }, load).subscribe(); const t = setInterval(load, 10000); return () => { supabase.removeChannel(ch); clearInterval(t); }; }, [load, shop.id]); // the timer is a backup for missed live updates

  const download = (buf, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf])); a.download = name; a.click(); };
  /** Builds the exact PDF to print for one file. Word/PowerPoint files are downloaded as they are (returns null). */
  async function prepare(f) {
    let raw = await fileBytes(f.storage_path);
    if (/\.(png|jpe?g)$/i.test(f.name)) raw = await imageToPdf(raw, f.name);
    else if (!/\.pdf$/i.test(f.name)) { download(raw, f.name); setMsg(`${f.name} is a Word/PowerPoint file, so the original was downloaded. Convert it to PDF to print the exact pages.`); return null; }
    return buildPrintPdf(raw, { ranges: f.ranges, layout: f.layout, arrangement: f.arrangement || 'horizontal', copies: f.copies });
  }
  /** Shows the print-ready PDF in the window opened on the click, then asks the browser to print it. */
  function printIn(win, bytes) {
    if (!win) { download(bytes, 'print.pdf'); return setMsg('Your browser blocked the print window, so the PDF was downloaded. Open it and print.'); }
    win.location.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    setTimeout(() => { try { win.focus(); win.print(); } catch { /* the PDF viewer has its own print button */ } }, 1500);
  }
  async function run(f, mode) {
    setMsg(''); setBusy(`${mode}${f.id}`);
    const win = mode === 'print' ? window.open('', '_blank') : null; // opened during the click so pop-up blockers allow it
    if (win) win.document.write('<p style="font-family:sans-serif;padding:16px">Preparing your print…</p>');
    try {
      const bytes = await prepare(f); if (!bytes) { win?.close(); return; }
      if (mode === 'preview') setSheets({ bytes, gray: f.color === 'bw' });
      else if (mode === 'download') download(bytes, `${f.name.replace(/\.[^.]+$/, '')}-print.pdf`);
      else printIn(win, bytes);
    } catch (e) { win?.close(); setMsg(`Could not open ${f.name}: ${e.message || 'unknown error'}`); } finally { setBusy(''); }
  }
  async function complete(o) {
    const { error } = await supabase.rpc('complete_order', { p_order: o.id });
    if (error) return setMsg(error.message);
    const { error: e2 } = await supabase.storage.from('print-files').remove(o.order_files.map((f) => f.storage_path)); // files deleted permanently
    if (e2) setMsg('Order marked ready, but deleting files failed.');
    setOpenId(null); setSheets(null); load();
  }
  const close = () => { setOpenId(null); setSheets(null); setMsg(''); };
  const sel = orders.find((o) => o.id === openId);
  const alert = msg && <p role="alert" className="err">{msg}</p>;
  return <section className="card"><h2>📋 Queue</h2><p className="sub">Oldest first. Tap an order to open it.</p>
    {!sel && alert}{!orders.length && <p className="sub">No orders right now.</p>}
    <div className="qlist">{orders.map((o) => <button key={o.id} className="qrow" aria-label={`Open order ${o.token}, ${printedPages(o)} pages`} onClick={() => setOpenId(o.id)}><span className="qtok">{o.token}</span><span className="qpg">{printedPages(o)} pg</span></button>)}</div>
    {sel && <div className="modal" role="dialog" aria-modal="true" aria-labelledby="od"><div className="card">
      <h2 id="od">Token {sel.token}</h2><p className="sub">Student: user1 · {formatDateTime(sel.created_at)}</p><p className="sub">Bill: ₹{sel.total}</p>
      {sel.order_files.map((f) => <div className="file" key={f.id}><p><strong>{f.name}</strong></p>
        <p className="sub">Type: {typeOf(f.name)} · {plural(f.pages, 'page')} · ₹{f.cost}</p><p className="sub">{optText(f)}</p>
        <p className="sub">Printer: A4, 1 page per sheet (the layout is already arranged), {f.color === 'bw' ? 'black & white' : 'colour'}, {f.sides} sided.</p>
        <div className="btns3">{[['preview', 'Preview'], ['print', 'Print'], ['download', 'Download']].map(([m, l]) =>
          <button key={m} disabled={!!busy} aria-label={`${l} ${f.name}`} onClick={() => run(f, m)}>{busy === m + f.id ? 'Wait…' : l}</button>)}</div></div>)}
      {alert}{sheets && <><h3>Preview of printed sheets</h3><SheetViewer bytes={sheets.bytes} gray={sheets.gray} /></>}
      <button className="primary" onClick={() => complete(sel)}>Mark order {sel.token} completed</button>
      <button className="ghost" onClick={close}>Close details</button></div></div>}</section>;
}

function Settings({ shop, setShop }) {
  const [s, setS] = useState({ open_time: shop.open_time.slice(0, 5), close_time: shop.close_time.slice(0, 5) }), [msg, setMsg] = useState('');
  async function save(patch, ok) { const { data, error } = await supabase.from('shops').update(patch).eq('id', shop.id).select().single();
    if (error) setMsg('Could not save. Try again.'); else { setShop(data); setMsg(ok); } }
  const status = shop.override === 'open' ? 'Open now (set by you)' : shop.override === 'closed' ? 'Closed now (set by you)' : 'Following the daily timings';
  return <section className="card"><h2>⚙️ Shop settings</h2><p className="sub" role="status">Status: {status}</p>
    <div className="btns"><button className="sm" onClick={() => save({ override: 'open' }, 'The shop is open now.')}>Open now</button>
      <button className="sm" onClick={() => save({ override: 'closed' }, 'The shop is closed now.')}>Close now</button></div>
    {shop.override && <button className="ghost" onClick={() => save({ override: null }, 'Back to the daily timings.')}>Use the daily timings again</button>}
    <h3>🕘 Daily timings</h3>
    <TimePicker label="Opening time" value={s.open_time} onChange={(v) => setS({ ...s, open_time: v })} />
    <TimePicker label="Closing time" value={s.close_time} onChange={(v) => setS({ ...s, close_time: v })} />
    <button className="primary" onClick={() => save(s, 'Daily timings saved.')}>Save daily timings</button>
    <button className="ghost" onClick={() => save({ closed_date: istToday() }, 'The shop is closed for today.')}>Close shop today</button>
    {msg && <p role="status">{msg}</p>}</section>;
}

function Prices({ shop, setShop }) {
  const keys = [['price_bw_single', 'B&W single sided'], ['price_bw_double', 'B&W double sided'], ['price_color_single', 'Colour single sided'], ['price_color_double', 'Colour double sided'], ['price_spiral', 'Spiral binding']];
  const [p, setP] = useState(Object.fromEntries(keys.map(([k]) => [k, shop[k]]))), [msg, setMsg] = useState('');
  async function save(e) { e.preventDefault(); const { data, error } = await supabase.from('shops').update(p).eq('id', shop.id).select().single();
    if (error) setMsg('Could not save prices.'); else { setShop(data); setMsg('Prices saved.'); } }
  return <form className="card" onSubmit={save}><h2>💰 Prices (₹)</h2>{keys.map(([k, l]) => <Field key={k} label={l}><input type="number" min="0" required value={p[k]} onChange={(e) => setP({ ...p, [k]: +e.target.value })} /></Field>)}
    {msg && <p role="status">{msg}</p>}<button className="primary">Save prices</button></form>;
}

function Chat({ shop }) {
  const [msgs, setMsgs] = useState([]), [tokens, setTokens] = useState({}), [sel, setSel] = useState(null), [text, setText] = useState('');
  const load = useCallback(async () => {
    const [{ data: m }, { data: o }] = await Promise.all([
      supabase.from('messages').select('*').eq('shop_id', shop.id).order('created_at'),
      supabase.from('orders').select('student_id, token').eq('shop_id', shop.id).not('token', 'is', null).order('created_at', { ascending: false })]);
    setMsgs(m || []);
    const latest = {}; (o || []).forEach((r) => { if (!latest[r.student_id]) latest[r.student_id] = r.token; }); // newest token per student
    setTokens(latest);
  }, [shop.id]);
  useEffect(() => {
    load();
    const ch = supabase.channel('m').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `shop_id=eq.${shop.id}` }, load).subscribe();
    const t = setInterval(load, 5000); // backup in case a live update is missed
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [load, shop.id]);
  const students = [...new Set(msgs.map((m) => m.student_id))];
  const nameOf = (id) => [...msgs].reverse().find((m) => m.student_id === id && m.sender === 'student' && m.sender_name)?.sender_name || 'user1';
  const label = (id) => (tokens[id] ? `${nameOf(id)} · ${tokens[id]}` : nameOf(id));
  async function send(e) { e.preventDefault(); if (!text.trim()) return;
    await supabase.from('messages').insert({ shop_id: shop.id, student_id: sel, sender: 'shop', body: text.trim() }); setText(''); load(); }
  return <section className="card"><h2>💬 Chat inbox</h2>{!students.length && <p className="sub">No messages yet.</p>}
    <div className="grid">{students.map((s) => <button key={s} className={sel === s ? 'primary' : 'tab'} onClick={() => setSel(s)}>{label(s)}</button>)}</div>
    {sel && <><h3>{label(sel)}</h3><div className="bubbles" aria-live="polite">{msgs.filter((m) => m.student_id === sel).map((m) => <p key={m.id} className={m.sender === 'shop' ? 'bub me' : 'bub them'}>{m.body}</p>)}</div>
      <form onSubmit={send}><Field label="Your reply"><input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Type your reply" /></Field><button className="primary">Send reply</button></form></>}</section>;
}

/** Clock-style time picker (the phone's own clock) with a 12-hour AM/PM readout. Stores 24-hour "HH:MM". */
function TimePicker({ label, value, onChange }) {
  const [h, m] = value.split(':').map(Number);
  return <label className="field"><span className="lbl"><i aria-hidden="true" />{label}</span>
    <input type="time" step="300" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />
    <span className="sub left">{`${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`}</span></label>;
}
