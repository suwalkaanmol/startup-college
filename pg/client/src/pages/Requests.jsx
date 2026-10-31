// Incoming and sent requests: roommate requests, and requests to join groups.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { api, useLive } from '../api.js';
import { useToast } from '../context/ToastContext.jsx';
import { Avatar, Empty, Spinner } from '../components/ui.jsx';

const seats = (n) => `${n} ${n === 1 ? 'seat' : 'seats'} left`;

export default function Requests() {
  const toast = useToast(), nav = useNavigate(), { refreshBadges } = useOutletContext();
  const [d, setD] = useState(null);
  const load = useCallback(() => api.get('/requests').then(setD).catch((e) => toast(e.message, 'err')), [toast]);
  useEffect(() => { load(); }, [load]);
  useLive(load);

  const run = async (path, msg, after) => { try { const r = await api.post(path); toast(msg); load(); refreshBadges(); after?.(r); } catch (e) { toast(e.message, 'err'); } };
  if (!d) return <Spinner />;
  const Person = ({ name, meta, children }) => <div className="row" style={{ cursor: 'default' }}><Avatar name={name} /><span className="grow"><strong>{name}</strong><br /><span className="meta">{meta}</span></span>{children}</div>;
  const none = d.incoming.length === 0 && d.joinIncoming.length === 0;

  return (<>
    <p className="hint">Group slots used: {d.slots.used} of {d.slots.max} (groups, plus requests you sent).</p>
    <h2>Received</h2>
    {none && <Empty title="No requests yet" text="When a student asks to room with you, or asks to join your group, it shows up here." action={<Link className="btn" to="/matches">Find roommates</Link>} />}
    {d.incoming.map((r) => <Person key={r.id} name={r.user.name} meta={`${r.user.company} · wants a group of ${r.groupSize}`}>
      <button className="btn" onClick={() => run(`/requests/${r.id}/accept`, 'Request accepted.', (x) => nav(`/groups/${x.groupId}`))}>Accept</button>
      <button className="btn secondary" onClick={() => run(`/requests/${r.id}/decline`, 'Request declined.')}>Decline</button></Person>)}
    {d.joinIncoming.map((j) => <Person key={j.id} name={j.user.name} meta={`${j.user.company} · wants to join your group with ${j.memberNames.filter((n) => n !== j.user.name).map((n) => n.split(' ')[0]).join(', ')} · ${seats(j.seatsLeft)}`}>
      <button className="btn" onClick={() => run(`/groups/join-requests/${j.id}/accept`, `${j.user.name.split(' ')[0]} joined your group.`, (x) => nav(`/groups/${x.groupId}`))}>Accept</button>
      <button className="btn secondary" onClick={() => run(`/groups/join-requests/${j.id}/decline`, 'Request declined.')}>Decline</button></Person>)}
    <h2 style={{ marginTop: 24 }}>Sent</h2>
    {d.outgoing.length === 0 && d.joinOutgoing.length === 0 ? <p className="hint">You have no pending requests.</p> : (<>
      {d.outgoing.map((r) => <Person key={r.id} name={r.user.name} meta={`${r.user.company} · group of ${r.groupSize}`}><button className="btn secondary" onClick={() => run(`/requests/${r.id}/cancel`, 'Request cancelled.')}>Cancel</button></Person>)}
      {d.joinOutgoing.map((j) => <Person key={j.id} name={`Group with ${j.memberNames.map((n) => n.split(' ')[0]).join(', ')}`} meta={`You asked to join · ${seats(j.seatsLeft)}`}><button className="btn secondary" onClick={() => run(`/groups/join-requests/${j.id}/cancel`, 'Request cancelled.')}>Cancel</button></Person>)}
    </>)}
  </>);
}
