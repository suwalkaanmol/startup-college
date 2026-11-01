// Find PGs: filters, list, and a detail modal with the (free) reservation form.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Empty, Modal, Pill, Spinner } from '../components/ui.jsx';

const FOOD = { none: 'No meals', veg: 'Vegetarian meals', veg_nonveg: 'Veg and non-veg meals' };
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');
const isoDate = (d) => d.toISOString().slice(0, 10);

export default function PGs() {
  const [params] = useSearchParams(), withGroup = params.get('with');
  const [f, setF] = useState({ sharing: 'double', maxRent: '', meals: false, noCurfew: false, sort: 'distance' });
  const [list, setList] = useState(null), [openId, setOpenId] = useState(null), [mates, setMates] = useState(null);

  // Roommate options exist only for people in the ?with= group who picked each other with me.
  useEffect(() => {
    if (!withGroup) return;
    api.get('/groups').then((d) => { const g = d.groups.find((x) => x.id === withGroup); setMates(g?.roommates ? { groupId: g.id, list: g.members.filter((m) => m.roommate) } : null); }).catch(() => {});
  }, [withGroup]);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ sharing: f.sharing, sort: f.sort === 'rent' ? 'rent' : 'distance' });
    if (f.maxRent) p.set('maxRent', f.maxRent);
    if (f.meals) p.set('meals', '1');
    if (f.noCurfew) p.set('noCurfew', '1');
    return p.toString();
  }, [f]);
  const load = useCallback(() => api.get('/pgs?' + qs).then((d) => setList(d.pgs)).catch(() => setList([])), [qs]);
  useEffect(() => { load(); }, [load]);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  return (<>
    <div className="card">
      <fieldset><legend>Sharing</legend>
        <div className="seg">{['single', 'double', 'triple'].map((s) => <button type="button" key={s} className={f.sharing === s ? 'on' : ''} aria-pressed={f.sharing === s} onClick={() => set('sharing', s)}>{s[0].toUpperCase() + s.slice(1)}</button>)}</div>
      </fieldset>
      <div className="toolbar">
        <label className="inline">Max rent per bed (₹)<input className="km" style={{ width: 110 }} type="number" min="0" step="500" value={f.maxRent} onChange={(e) => set('maxRent', e.target.value)} /></label>
        <label className="inline"><input type="checkbox" checked={f.meals} onChange={(e) => set('meals', e.target.checked)} />Meals included</label>
        <label className="inline"><input type="checkbox" checked={f.noCurfew} onChange={(e) => set('noCurfew', e.target.checked)} />No curfew</label>
        <label className="inline">Sort<select style={{ width: 'auto' }} value={f.sort} onChange={(e) => set('sort', e.target.value)}><option value="distance">Nearest</option><option value="rent">Lowest rent</option></select></label>
      </div>
    </div>
    {!list ? <Spinner /> : list.length === 0
      ? <Empty title="No PGs match" text="Try a different sharing type, a higher rent limit, or a larger distance in your profile." />
      : list.map((p) => (
        <button key={p.id} className="row" onClick={() => setOpenId(p.id)}>
          <span className="grow"><strong>{p.name}</strong><br /><span className="meta">{p.distanceKm} km from office · {p.bedsLeft} {p.bedsLeft === 1 ? 'bed' : 'beds'} left</span></span>
          <strong>{inr(p.rent[f.sharing])}</strong>
        </button>))}
    {openId && <PGModal id={openId} sharing={f.sharing} mates={mates} onClose={() => setOpenId(null)} onBooked={() => { setOpenId(null); load(); }} />}
  </>);
}

function PGModal({ id, sharing: initial, mates, onClose, onBooked }) {
  const toast = useToast(), nav = useNavigate(), { refreshBadges } = useOutletContext();
  const [pg, setPg] = useState(null), [who, setWho] = useState('me'), [sharing, setSharing] = useState(initial);
  const first = (n) => n.split(' ')[0];
  const today = isoDate(new Date()), max = (() => { const d = new Date(); d.setMonth(d.getMonth() + 12); return isoDate(d); })();
  const { profile: me } = useAuth(), [moveIn, setMoveIn] = useState(me?.moveInDate && me.moveInDate >= today ? me.moveInDate : today), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  useEffect(() => { api.get('/pgs/' + id).then((d) => setPg(d.pg)).catch((e) => { toast(e.message, 'err'); onClose(); }); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Who is moving in: just me, me and one roommate, or (when two roommates picked me back) all three.
  const choices = mates ? [{ key: 'me', label: 'Just me', ids: [] },
    ...mates.list.map((m) => ({ key: m.id, label: `Me and ${first(m.name)}`, ids: [m.id] })),
    ...(mates.list.length >= 2 ? [{ key: 'all', label: `Me, ${mates.list.map((m) => first(m.name)).join(' and ')}`, ids: mates.list.map((m) => m.id) }] : [])] : [];
  const ids = (choices.find((c) => c.key === who) || { ids: [] }).ids, together = ids.length > 0, people = 1 + ids.length;
  const pickWho = (key) => {
    setWho(key);
    const n = 1 + (choices.find((c) => c.key === key)?.ids.length || 0);
    if (n === 3) setSharing('triple'); else if (n === 2 && sharing === 'single') setSharing('double');
  };
  const book = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api.post('/bookings', { pgId: pg.id, sharing, moveIn, ...(together ? { groupId: mates.groupId, withUserIds: ids } : {}) });
      toast(r.status === 'confirmed' ? 'Reservation confirmed. Credits added.' : 'Sent to your roommates. They need to accept it.');
      refreshBadges(); onBooked(); nav('/bookings');
    } catch (e) {
      const known = { ACTIVE_BOOKING: e.message, NO_BEDS: 'Not enough beds are left in this PG.', NOT_CONFIRMED: 'You can only book with roommates who picked you and whom you picked.', BAD_SHARING: people === 3 ? 'Three roommates need a triple room.' : 'Roommates need a double or triple room.' };
      setErr(known[e.code] || e.message);
    } finally { setBusy(false); }
  };

  return (
    <Modal title={pg ? pg.name : 'Loading'} onClose={onClose}>
      {!pg ? <Spinner /> : (<>
        <p><Pill tone="warn">Sample listing</Pill> <span className="meta">{pg.locality} · {pg.distanceKm} km from office · {pg.bedsLeft} of {pg.bedsTotal} beds left</span></p>
        <dl className="facts">
          <dt>Rent per bed</dt><dd>Single {inr(pg.rent.single)} · Double {inr(pg.rent.double)} · Triple {inr(pg.rent.triple)}</dd>
          <dt>Deposit</dt><dd>{pg.depositMonths} {pg.depositMonths === 1 ? 'month' : 'months'} of rent, refundable</dd>
          <dt>Food</dt><dd>{FOOD[pg.food] || pg.food}</dd>
          <dt>Curfew</dt><dd>{pg.gateCloses ? `Gate closes at ${pg.gateCloses}` : 'No curfew'}</dd>
          <dt>Rules</dt><dd>{pg.rules?.length ? pg.rules.join(', ') : 'None listed'}</dd>
          <dt>Amenities</dt><dd>{pg.amenities?.length ? pg.amenities.join(', ') : 'None listed'}</dd>
        </dl>
        <h3>Reserve a bed</h3>
        {mates && <fieldset><legend>Who is moving in?</legend><div className="seg">
          {choices.map((c) => <button type="button" key={c.key} className={who === c.key ? 'on' : ''} aria-pressed={who === c.key} onClick={() => pickWho(c.key)}>{c.label}</button>)}</div></fieldset>}
        <fieldset><legend>Sharing</legend><div className="seg">
          {['single', 'double', 'triple'].filter((s) => !(together && s === 'single') && !(people === 3 && s === 'double')).map((s) => <button type="button" key={s} className={sharing === s ? 'on' : ''} aria-pressed={sharing === s} onClick={() => setSharing(s)}>{s[0].toUpperCase() + s.slice(1)}</button>)}</div></fieldset>
        <label className="field"><span className="label">Move-in date</span><input type="date" min={today} max={max} value={moveIn} onChange={(e) => setMoveIn(e.target.value)} /></label>
        <Cost rent={pg.rent[sharing]} months={pg.depositMonths} people={people} />
        <p className="hint">No payment is taken in the app. You pay the PG directly at move-in. You can cancel for free from My Bookings.</p>
        {err && <div className="alert err" role="alert">{err}</div>}
        <button className="btn block" onClick={book} disabled={busy || !moveIn || moveIn < today || moveIn > max}>{busy ? 'Reserving…' : together ? (people === 2 ? 'Reserve for both of us' : 'Reserve for all three of us') : 'Reserve my bed'}</button>
      </>)}
    </Modal>
  );
}

function Cost({ rent, months, people }) {
  const deposit = rent * months, each = rent + deposit;
  return (
    <div className="cost">
      <div><span>First month rent</span><strong>{inr(rent)}</strong></div>
      <div><span>Refundable deposit</span><strong>{inr(deposit)}</strong></div>
      <div className="due"><span>Due at move-in, per person</span><strong>{inr(each)}</strong></div>
      {people > 1 && <div><span>{people === 2 ? 'Total for both' : 'Total for all three'}</span><strong>{inr(each * people)}</strong></div>}
    </div>
  );
}
