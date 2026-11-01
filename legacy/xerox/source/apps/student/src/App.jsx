import { useEffect, useState } from 'react';
import { calcOrder, validateRange, isShopOpen, buildPrintPdf, imageToPdf, plural, formatDate, formatTime } from '@unihub/shared';
import { SheetViewer } from '@unihub/shared/src/SheetViewer.jsx';
import { ThemeToggle, InfoIcon } from '@unihub/shared/src/ThemeToggle.jsx';
import { supabase, ensureSession } from './supabase.js';
import { countPages } from './pageCount.js';
import { payTest } from './payment.js';
import { uploadWithProgress } from './upload.js';
import { ArrangementPreview, MyOrders, Chat } from './Extras.jsx';
import { LegalPage, CookieBanner, useHashPage } from '@unihub/shared/src/Legal.jsx';

const MAX_MB = 100, OK = /\.(pdf|docx|pptx|png|jpe?g)$/i;
const DEFAULTS = { color: 'bw', sides: 'single', layout: 1, arrangement: 'horizontal', copies: 1, spiral: false, mode: 'full', ranges: [{ from: 1, to: 1 }] };
const toShop = (r) => ({ ...r, override: r.override, closedDate: r.closed_date, openTime: r.open_time.slice(0, 5), closeTime: r.close_time.slice(0, 5) });
const ratesOf = (s) => ({ bwSingle: s.price_bw_single, bwDouble: s.price_bw_double, colorSingle: s.price_color_single, colorDouble: s.price_color_double, spiral: s.price_spiral });

/** First error among several page ranges, or null. */
const rangesError = (ranges, pages) => ranges.map((r) => validateRange(+r.from, +r.to, pages)).find(Boolean) || null;

function Field({ label, children }) {
  return <label className="field"><span className="lbl"><i aria-hidden="true" />{label}</span>{children}</label>;
}

function Options({ o, set, pages }) {
  const u = (k) => (e) => set({ ...o, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const setRange = (i, k, v) => set({ ...o, ranges: o.ranges.map((r, j) => (j === i ? { ...r, [k]: v } : r)) });
  const err = o.mode === 'range' && pages ? rangesError(o.ranges, pages) : null;
  return <div className="opts">
    <Field label="Colour"><select value={o.color} onChange={u('color')}><option value="bw">Black &amp; white</option><option value="color">Colour</option></select></Field>
    <Field label="Sides"><select value={o.sides} onChange={u('sides')}><option value="single">Single sided</option><option value="double">Double sided</option></select></Field>
    <Field label="Pages per sheet face"><select value={o.layout} onChange={(e) => set({ ...o, layout: +e.target.value })}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}-in-1</option>)}</select></Field>
    {o.layout > 1 && <><ArrangementPreview layout={+o.layout} arrangement={o.arrangement} /><Field label="Page arrangement"><select value={o.arrangement} onChange={u('arrangement')}><option value="horizontal">Horizontal (side by side)</option><option value="vertical">Vertical (stacked)</option></select></Field></>}
    <Field label="Pages"><select value={o.mode} onChange={u('mode')}><option value="full">Full document</option><option value="range">Manual range</option></select></Field>
    {o.mode === 'range' && <>
      {o.ranges.map((r, i) => <div className="row rng" key={i}>
        <Field label={`Range ${i + 1}: from`}><input type="number" min="1" inputMode="numeric" placeholder="1" value={r.from} onChange={(e) => setRange(i, 'from', e.target.value)} /></Field>
        <Field label="to"><input type="number" min="1" inputMode="numeric" placeholder="1" value={r.to} onChange={(e) => setRange(i, 'to', e.target.value)} /></Field>
        {o.ranges.length > 1 && <button type="button" className="ghost" aria-label={`Remove range ${i + 1}`} onClick={() => set({ ...o, ranges: o.ranges.filter((_, j) => j !== i) })}>✕</button>}</div>)}
      <button type="button" className="ghost" aria-label="Add another page range" disabled={o.ranges.length >= 10} onClick={() => set({ ...o, ranges: [...o.ranges, { from: 1, to: 1 }] })}>＋ Add another range</button></>}
    {err && <p role="alert" className="err">{err}</p>}
    <Field label="Copies"><input type="text" inputMode="numeric" placeholder="1" autoComplete="off" value={o.copies} onChange={(e) => set({ ...o, copies: e.target.value.replace(/\D/g, '').slice(0, 3) })} onBlur={() => set({ ...o, copies: String(Math.max(1, Math.min(100, +o.copies || 1))) })} /></Field>
    <label className="check"><input type="checkbox" checked={o.spiral} onChange={u('spiral')} /> Spiral binding</label>
  </div>;
}

function OrderFlow() {
  const [shops, setShops] = useState([]), [shop, setShop] = useState(null), [files, setFiles] = useState([]);
  const [same, setSame] = useState(true), [shared, setShared] = useState(DEFAULTS), [consent, setConsent] = useState(false);
  const [preview, setPreview] = useState(null), [msg, setMsg] = useState(''), [uid, setUid] = useState(null), [pay, setPay] = useState(null), [invoice, setInvoice] = useState(null);

  useEffect(() => {
    (async () => {
      try { setUid((await ensureSession()).id); const { data, error } = await supabase.from('shops').select('*'); if (error) throw error; setShops(data.map(toShop)); }
      catch { setMsg('Could not connect. Check your internet and reload.'); }
    })();
  }, []);

  // Live order status once an invoice exists.
  useEffect(() => {
    if (!invoice) return;
    const ch = supabase.channel('o' + invoice.id).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${invoice.id}` },
      (p) => setInvoice((i) => ({ ...i, status: p.new.status }))).subscribe();
    return () => supabase.removeChannel(ch);
  }, [invoice?.id]);

  const opts = (f) => (same ? shared : f.o);
  const toApi = (f) => { const o = opts(f); return { name: f.name, storage_path: f.path, pages: f.pages, color: o.color, sides: o.sides, layout: +o.layout,
    arrangement: o.layout > 1 ? o.arrangement : null, ranges: o.mode === 'range' ? o.ranges.map((r) => ({ from: +r.from, to: +r.to })) : null, copies: Math.max(1, Math.min(100, +o.copies || 1)), spiral: o.spiral }; };
  const bad = (f) => { const o = opts(f); return !f.pages || (o.mode === 'range' && rangesError(o.ranges, f.pages)); };
  const bill = shop && files.length ? calcOrder(files.filter((f) => !bad(f)).map(toApi), ratesOf(shop)) : null;

  async function addFiles(list) {
    setMsg('');
    for (const file of list) {
      if (!OK.test(file.name)) { setMsg(`${file.name}: only PDF, DOCX, PPTX or images are allowed.`); continue; }
      if (file.size > MAX_MB * 1048576) { setMsg(`${file.name} is larger than ${MAX_MB} MB.`); continue; }
      const user = await ensureSession().catch(() => null); // always the live session
      if (!user) return setMsg('Could not start your session. Check your internet and try again.');
      const path = `${shop.id}/${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, '_')}`;
      const entry = { id: path, name: file.name, path, pages: await countPages(file), counted: false, up: 'uploading', file, o: { ...DEFAULTS } };
      entry.counted = entry.pages !== null;
      setFiles((fs) => [...fs, entry]);
      let error = null;
      try { await uploadWithProgress(path, file, (pct) => setFiles((fs) => fs.map((f) => (f.id === path ? { ...f, pct } : f)))); } catch (e) { error = e; }
      if (!error) { const chk = await supabase.storage.from('print-files').createSignedUrl(path, 30); if (chk.error) error = chk.error; } // confirm the file really arrived
      setFiles((fs) => fs.map((f) => (f.id === path ? { ...f, up: error ? 'failed' : 'done', err: error?.message } : f)));
    }
  }

  async function checkout() {
    setMsg('');
    try {
      const ready = files.filter((f) => f.up === 'done');
      const { data, error } = await supabase.rpc('place_order', { p_shop: shop.id, p_files: ready.map(toApi) });
      if (error) throw error;
      const { data: o } = await supabase.from('orders').select('id,total,breakdown').eq('id', data).single();
      setPay(o);
    } catch (e) { setMsg(e.message || 'Could not place the order.'); }
  }

  if (invoice) return <Invoice inv={invoice} onDone={() => { setInvoice(null); setFiles([]); setShop(null); }} />;
  if (!shop) return <main><Header /><section className="card"><h2>🖨️ New Print Order</h2><p className="sub">Choose a shop to start</p>{msg && <p role="alert" className="err">{msg}</p>}
    <div className="grid">{shops.filter((s) => s.grp === 'main').map((s) => <ShopCard key={s.id} s={s} onPick={(s) => { setMsg(''); setShop(s); }} />)}</div>
    <h3>🏠 Men&apos;s Hostel</h3><div className="grid">{shops.filter((s) => s.grp === 'hostel').map((s) => <ShopCard key={s.id} s={s} onPick={(s) => { setMsg(''); setShop(s); }} />)}</div></section><CookieBanner /></main>;

  const canPay = consent && files.length && files.every((f) => f.up === 'done' && !bad(f)) && isShopOpen(shop);
  return <main><Header />
    <section className="card"><h2>🖨️ {shop.name}</h2><p className="sub">{isShopOpen(shop) ? 'Open now' : 'Closed: orders are not accepted'}</p>
      <button className="ghost" onClick={() => { setShop(null); setFiles([]); setMsg(''); }}>Choose a different shop</button>
      <h3>📄 Files</h3>
      <Field label="Add files (PDF, DOCX, PPTX, images)"><input type="file" multiple accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg" onChange={(e) => addFiles([...e.target.files])} /></Field>
      {files.length > 1 && <label className="check"><input type="checkbox" checked={same} onChange={(e) => setSame(e.target.checked)} /><span>Same settings for all files</span></label>}
      {files.map((f, i) => <div className="file" key={f.id}><strong>{f.name}</strong> <span className="sub">{f.up === 'uploading' ? <progress max="100" value={f.pct || 0} aria-label={`Uploading ${f.name}`} /> : f.up === 'failed' ? <span role="alert" className="err">Upload failed: {f.err || 'unknown error'}. Remove this file and try again.</span> : 'Uploaded'}</span>
        {!f.counted && <Field label="Could not count pages automatically. Enter the page count"><input type="number" min="1" value={f.pages || ''} onChange={(e) => setFiles((fs) => fs.map((x) => (x.id === f.id ? { ...x, pages: +e.target.value || null } : x)))} /></Field>}
        {f.counted && <span className="sub"> · {plural(f.pages, 'page')}</span>}
        {(i === 0 || !same) && <>
          <Options o={same ? shared : f.o} set={same ? setShared : (o) => setFiles((fs) => fs.map((x) => (x.id === f.id ? { ...x, o } : x)))} pages={same ? Math.min(...files.map((x) => x.pages || 1e9), 1e9) : f.pages} />
          <button className="ghost" disabled={!f.pages} onClick={() => setPreview({ f, o: same ? shared : f.o })}>Preview how it will print</button></>}
        {i > 0 && same && <p className="sub">Uses the same settings as the first file.</p>}
        <button className="ghost" onClick={() => setFiles((fs) => fs.filter((x) => x.id !== f.id))} aria-label={`Remove ${f.name}`}>Remove file</button>
        {bill && !bad(f) && <p className="sub">Cost: ₹{bill.perFile[files.filter((x) => !bad(x)).indexOf(f)]?.cost}</p>}</div>)}
      {bill && <div className="bill"><h3>🧾 Price details</h3>
        <p>B&amp;W: {plural(bill.sheets.bw.single + bill.sheets.bw.double, 'sheet')} · ₹{bill.bwCost}</p><p>Colour: {plural(bill.sheets.color.single + bill.sheets.color.double, 'sheet')} · ₹{bill.colorCost}</p>
        <p>Spiral binding: ₹{bill.spiralCost}</p><p className="total">Total ₹{bill.total}</p></div>}
      <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>I agree to the <a href="#/privacy">Privacy Policy</a>, <a href="#/terms">Terms</a> and <a href="#/refund">Refund policy</a>, and consent to my files being uploaded for printing.</span></label>
      {msg && <p role="alert" className="err">{msg}</p>}
      <button className="primary" disabled={!canPay} onClick={checkout}>Pay for order (test payment)</button></section>
    {preview && <PreviewDialog {...preview} onClose={() => setPreview(null)} />}
    {pay && <PayDialog order={pay} shopName={shop.name} onCancel={() => setPay(null)} onPaid={(token) => setInvoice({ ...pay, token, status: 'preparing', shop: shop.name, at: new Date(), files: files.map((f, i) => ({ name: f.name, cost: bill.perFile[i]?.cost })) })} />}
  </main>;
}

const Header = () => <header className="hero"><a className="theme-btn left" href="#/about" aria-label="About, policies and contact"><InfoIcon /></a><ThemeToggle /><h1>Welcome to UniHub Print</h1><p>Print from your phone and collect at the shop.</p></header>;
const ShopCard = ({ s, onPick }) => { const open = isShopOpen(s); return <button className="tab" disabled={!open} onClick={() => onPick(s)}>
  <span aria-hidden="true">🖨️ </span>{s.name}<br /><small className={open ? 'on' : 'off'}>{open ? 'Open' : 'Closed'}</small></button>; };

function PayDialog({ order, shopName, onCancel, onPaid }) {
  const [pw, setPw] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  async function submit(e) { e.preventDefault(); setBusy(true); setErr('');
    try { onPaid(await payTest(order.id, pw)); } catch (x) { setErr(x.message); setBusy(false); } }
  return <div className="modal pay" role="dialog" aria-modal="true" aria-labelledby="pt"><form className="paysheet" onSubmit={submit}>
    <div className="payhead"><p className="paytest">TEST PAYMENT · no real money is charged</p><h2 id="pt">Pay securely</h2><p>to {shopName}</p></div>
    <div className="paybody"><p className="payamt-lbl">Amount to pay</p><p className="payamt">₹{order.total}</p>
      <p className="paylock"><span aria-hidden="true">🔒</span> This amount is fixed and cannot be changed</p>
      <Field label="Test password"><input type="password" inputMode="numeric" autoComplete="off" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
      {err && <p role="alert" className="err">{err}</p>}
      <button className="paybtn" disabled={busy || !pw}>{busy ? 'Paying…' : `Pay ₹${order.total} (test)`}</button>
      <button type="button" className="ghost" onClick={onCancel}>Cancel payment</button></div></form></div>;
}

function Invoice({ inv, onDone }) {
  const label = { preparing: 'Preparing your order', ready: 'Ready, please collect', completed: 'Completed' }[inv.status] || inv.status;
  return <main><Header /><section className="card"><h2>✅ Invoice (test payment)</h2>
    <p className="token" aria-label={`Your token is ${inv.token}`}>{inv.token}</p><p className="sub" aria-live="polite">{label}</p>
    <p>Date: {formatDate(inv.at)}</p><p>Time: {formatTime(inv.at)}</p><p>Shop: {inv.shop}</p>
    {inv.files.map((f, i) => <p key={i}>{f.name}: ₹{f.cost}</p>)}<p className="total">Total paid ₹{inv.total}</p>
    <button className="primary" onClick={onDone}>Start a new order</button></section></main>;
}

/** Shows the printed sheets exactly as the shop will print them: all chosen ranges together, in black & white if B&W is chosen. */
function PreviewDialog({ f, o, onClose }) {
  const [sheet, setSheet] = useState(null), [state, setState] = useState('loading');
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        let bytes = new Uint8Array(await f.file.arrayBuffer());
        if (/\.(png|jpe?g)$/i.test(f.name)) bytes = await imageToPdf(bytes, f.name);
        else if (!/\.pdf$/i.test(f.name)) return setState('unsupported');
        const ranges = o.mode === 'range' ? o.ranges.map((r) => ({ from: +r.from, to: +r.to })) : null;
        const out = await buildPrintPdf(bytes, { ranges, layout: +o.layout, arrangement: o.arrangement, copies: 1 });
        if (!dead) { setSheet(out); setState('ready'); }
      } catch { if (!dead) setState('failed'); }
    })();
    return () => { dead = true; };
  }, [f, o]);
  return <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pv"><div className="card">
    <h2 id="pv">Preview</h2><p className="sub">{o.layout}-in-1{o.layout > 1 ? `, ${o.arrangement}` : ''} · {o.color === 'bw' ? 'Black & white' : 'Colour'} · shows up to 12 sheets</p>
    {state === 'loading' && <p className="sub" role="status">Preparing preview…</p>}
    {state === 'failed' && <p role="alert" className="err">Could not build the preview for this file.</p>}
    {state === 'unsupported' && <><p className="sub">A page preview is not available for Word or PowerPoint files. The shop prints them with the same layout:</p><ArrangementPreview layout={+o.layout} arrangement={o.arrangement} /></>}
    {state === 'ready' && <SheetViewer bytes={sheet} maxSheets={12} gray={o.color === 'bw'} />}
    <button className="primary" onClick={onClose}>Close preview</button></div></div>;
}

/** Always-visible way back to the main campus app (the module lives in /xerox/). */
const BackLink = () => <div className="topbar"><a className="back-link" href="../index.html">← Back to Campus Hub</a></div>;

export default function App() {
  const legal = useHashPage(), [view, setView] = useState('order'), [uid, setUid] = useState(null), [shops, setShops] = useState([]);
  useEffect(() => { ensureSession().then((u) => { setUid(u.id); return supabase.from('shops').select('id,name'); }).then(({ data }) => setShops(data || [])).catch(() => {}); }, []);
  if (legal) return <><BackLink /><LegalPage id={legal} /></>;
  return <>
    <BackLink />
    <nav className="tabs" aria-label="Sections">{[['order', '🖨️ New order'], ['orders', '📦 My orders'], ['chat', '💬 Chat']].map(([k, l]) =>
      <button key={k} aria-current={view === k} onClick={() => setView(k)}>{l}</button>)}</nav>
    <div hidden={view !== 'order'}><OrderFlow /></div>
    {view === 'orders' && <main><MyOrders uid={uid} /></main>}{view === 'chat' && <main><Chat uid={uid} shops={shops} /></main>}</>;
}
