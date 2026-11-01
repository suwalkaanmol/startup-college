// Find roommates: students and open groups shown as small blocks. Tapping a block opens details and actions.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { api, useLive } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useMeta } from '../useMeta.js';
import { Avatar, Empty, Modal, Pill, Spinner } from '../components/ui.jsx';
import SafetyActions from '../components/SafetyActions.jsx';
import { niceDate, shortDate } from '../dates.js';

const status = (r) => r.type === 'outgoing' ? <Pill tone="warn">Request sent</Pill> : r.type === 'incoming' ? <Pill tone="warn">Wants to connect</Pill> : r.type === 'group' ? <Pill tone="ok">In group</Pill> : null;
const tone = (s) => (s >= 75 ? 'hi' : s >= 50 ? 'mid' : 'low'); // colour of the match %
const seatText = (n) => `${n} ${n === 1 ? 'seat' : 'seats'} left`;
const first = (name) => name.split(' ')[0];

export default function Matches() {
  const { profile, loadProfile } = useAuth(), toast = useToast(), nav = useNavigate(), { refreshBadges } = useOutletContext();
  const { meta, labels } = useMeta();
  const [sort, setSort] = useState('best'), [same, setSame] = useState(false), [list, setList] = useState(null), [open, setOpen] = useState(null);
  const [groups, setGroups] = useState([]), [openGroup, setOpenGroup] = useState(null), [size, setSize] = useState(2);
  const [km, setKm] = useState(String(profile.maxDistanceKm));
  const maxSize = meta?.maxGroupSize || 6;

  const load = useCallback(() => {
    api.get(`/matches?sort=${sort}${same ? '&sameCompany=1' : ''}`).then((d) => setList(d.matches)).catch((e) => toast(e.message, 'err'));
    api.get('/groups/open').then((d) => setGroups(d.groups)).catch(() => {});
  }, [sort, same, toast]);
  useEffect(() => { load(); }, [load, profile.maxDistanceKm]);
  useLive(load);

  const saveKm = async () => {
    const n = Number(km);
    if (!Number.isInteger(n) || n < 1 || n > 200) { toast('Enter a distance from 1 to 200 km.', 'err'); return setKm(String(profile.maxDistanceKm)); }
    if (n === profile.maxDistanceKm) return;
    try { await api.patch('/profile/distance', { maxDistanceKm: n }); await loadProfile(); } catch (e) { toast(e.message, 'err'); }
  };
  const view = async (id) => { try { setSize(2); setOpen((await api.get(`/matches/${id}`)).match); } catch (e) { toast(e.message, 'err'); } };
  const done = () => { setOpen(null); setOpenGroup(null); load(); refreshBadges(); };
  const act = async (fn, msg) => { try { const d = await fn(); toast(msg); done(); return d; } catch (e) { toast(e.message, 'err'); } };

  return (<>
    <div className="card">
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Sort">
          {[['best', 'Best match'], ['nearest', 'Nearest']].map(([id, l]) => <button key={id} className={sort === id ? 'on' : ''} aria-pressed={sort === id} onClick={() => setSort(id)}>{l}</button>)}
        </div>
        <label className="inline">Max distance from office <input className="km" type="number" min="1" max="200" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} onBlur={saveKm} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} aria-label="Max distance from office in km" /> km</label>
        <label className="inline"><input type="checkbox" checked={same} onChange={(e) => setSame(e.target.checked)} /> Same company only</label>
      </div>
    </div>

    {groups.length > 0 && (<>
      <h2>Open groups</h2>
      <p className="hint">These groups still have free seats. Ask to join and the group owner decides. Full groups are hidden.</p>
      <div className="blocks">
        {groups.map((g) => (
          <button key={g.id} className="block-tile" onClick={() => setOpenGroup(g)}>
            <span className="avatars" aria-hidden="true">{g.members.slice(0, 3).map((m) => <Avatar key={m.id} name={m.name} />)}</span>
            <span className="grow"><strong className="nm">{g.members.map((m) => first(m.name)).join(', ')}</strong><br />
              <Pill tone="warn">{seatText(g.seatsLeft)}</Pill>{g.relation.type === 'requested' && <> <Pill tone="info">Requested</Pill></>}</span>
            {g.score !== null && <span className={`score ${tone(g.score)}`} aria-label={`${g.score} percent match`}>{g.score}%</span>}
          </button>))}
      </div>
    </>)}

    <h2>Students</h2>
    {list === null ? <Spinner /> : list.length === 0 ? (
      <Empty title="No students found yet" text="No one of your gender has an office within your distance. Try a larger distance." action={<Link className="btn" to="/profile">Edit profile</Link>} />
    ) : (
      <div className="blocks">
        {list.map((m) => (
          <button key={m.id} className="block-tile" onClick={() => view(m.id)}>
            <Avatar name={m.name} /><span className="grow"><strong className="nm">{m.name}</strong><br /><span className="meta">Moves in {shortDate(m.moveInDate)}</span>{status(m.relation) && <><br />{status(m.relation)}</>}</span>
            {m.score !== null && <span className={`score ${tone(m.score)}`} aria-label={`${m.score} percent match`}>{m.score}%</span>}
          </button>))}
      </div>)}

    {open && (
      <Modal title={open.name} onClose={() => setOpen(null)}>
        <p>{open.company} · {open.office} · {open.distanceKm} km from your office{open.sameCompany ? ' · Same company' : ''}</p>
        {open.score !== null && <p><Pill tone="info">{open.score}% roommate match</Pill></p>}
        {open.shared?.length > 0 && <p className="why"><strong>You both:</strong> {open.shared.map((t) => labels[t] || t).join(', ')}</p>}
        {open.bio && <p>{open.bio}</p>}
        <p><strong>Moving in on {niceDate(open.moveInDate)}</strong><br /><span className="hint">Could move any time from {niceDate(open.moveInFrom)} to {niceDate(open.moveInTo)}</span></p>
        {open.budget && <p className="hint">Budget ₹{open.budget.toLocaleString('en-IN')}/month</p>}
        <div className="chips">{open.tags.map((t) => <span key={t} className={`chip ${profile.tags.includes(t) ? 'on' : ''}`}>{open.priorities.includes(t) ? '★ ' : ''}{labels[t] || t}</span>)}</div>
        {open.relation.type === 'none' && (
          <fieldset style={{ marginTop: 16 }}><legend>How many people in your group, including you?</legend>
            <div className="seg">{Array.from({ length: maxSize - 1 }, (_, i) => i + 2).map((n) => <button type="button" key={n} className={size === n ? 'on' : ''} aria-pressed={size === n} onClick={() => setSize(n)}>{n}</button>)}</div>
            <p className="hint">Seats you do not fill stay open, so other students can ask to join. You can still choose only the roommates you want later.</p>
          </fieldset>)}
        <div className="chips" style={{ marginTop: 16 }}>
          {open.relation.type === 'none' && <button className="btn" onClick={() => act(() => api.post('/requests', { toUserId: open.id, groupSize: size }), 'Request sent.')}>Send request</button>}
          {open.relation.type === 'incoming' && <button className="btn" onClick={async () => { const d = await act(() => api.post(`/requests/${open.relation.requestId}/accept`), 'Request accepted.'); if (d) nav(`/groups/${d.groupId}`); }}>Accept request</button>}
          {open.relation.type === 'outgoing' && <button className="btn secondary" onClick={() => act(() => api.post(`/requests/${open.relation.requestId}/cancel`), 'Request cancelled.')}>Cancel request</button>}
          {open.relation.type === 'group' && <button className="btn" onClick={() => nav(`/groups/${open.relation.groupId}`)}>Open chat</button>}
        </div>
        <SafetyActions userId={open.id} name={open.name} onBlocked={done} />
      </Modal>)}

    {openGroup && (
      <Modal title={`Group of ${openGroup.capacity}`} onClose={() => setOpenGroup(null)}>
        <p><Pill tone="warn">{seatText(openGroup.seatsLeft)}</Pill> <span className="meta">{openGroup.members.length} of {openGroup.capacity} seats taken · {openGroup.distanceKm} km from your office</span></p>
        {openGroup.score !== null && <p><Pill tone="info">{openGroup.score}% average match</Pill></p>}
        {openGroup.members.map((m) => (
          <div className="row" style={{ cursor: 'default' }} key={m.id}><Avatar name={m.name} /><span className="grow"><strong>{m.name}</strong><br /><span className="meta">{m.company} · {m.office} · Moves in {shortDate(m.moveInDate)}</span></span></div>))}
        <p className="hint">The group owner decides who joins. Joining uses one of your group slots.</p>
        <div className="chips">
          {openGroup.relation.type === 'none' && <button className="btn" onClick={() => act(() => api.post(`/groups/${openGroup.id}/join`), 'Request to join sent.')}>Ask to join</button>}
          {openGroup.relation.type === 'requested' && <button className="btn secondary" onClick={() => act(() => api.post(`/groups/join-requests/${openGroup.relation.requestId}/cancel`), 'Request cancelled.')}>Cancel request</button>}
        </div>
      </Modal>)}
  </>);
}
