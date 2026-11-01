// My Bookings: reservations I made or was invited to.
import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api, useLive } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Empty, Modal, Pill, Spinner } from '../components/ui.jsx';

const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');
const STATUS = { confirmed: ['ok', 'Confirmed'], pending_partner: ['warn', 'Waiting for roommate'], declined: ['info', 'Declined'], cancelled: ['info', 'Cancelled'] };
const niceDate = (s) => new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function Bookings() {
  const toast = useToast(), { user } = useAuth(), { refreshBadges } = useOutletContext();
  const [list, setList] = useState(null), [confirmCancel, setConfirmCancel] = useState(null);
  const load = useCallback(() => api.get('/bookings').then((d) => setList(d.bookings)).catch((e) => toast(e.message, 'err')), [toast]);
  useEffect(() => { load(); }, [load]);
  useLive(load);

  const run = async (b, action, msg) => {
    try { await api.post(`/bookings/${b.id}/${action}`); toast(msg); load(); refreshBadges(); } catch (e) { toast(e.message, 'err'); }
    setConfirmCancel(null);
  };
  if (!list) return <Spinner />;
  if (list.length === 0) return <Empty title="No bookings yet" text="Find a PG near your office and reserve a bed. It is free and takes a minute." action={<Link className="btn" to="/pgs">Find PGs</Link>} />;

  return (<>
    {list.map((b) => {
      const [tone, label] = STATUS[b.status] || ['info', b.status], active = b.status === 'confirmed' || b.status === 'pending_partner';
      const others = b.members.filter((m) => m.id !== user.id).map((m) => m.name);
      return (
        <div className="card" key={b.id}>
          <div className="toolbar" style={{ justifyContent: 'space-between' }}><h2 style={{ margin: 0 }}>{b.pgName}</h2><Pill tone={tone}>{label}</Pill></div>
          <p className="meta">{b.locality} · Booking ID {b.id}</p>
          <dl className="facts">
            <dt>Sharing</dt><dd>{b.sharing[0].toUpperCase() + b.sharing.slice(1)}{others.length ? ` with ${others.join(', ')}` : ''}</dd>
            <dt>Move-in</dt><dd>{niceDate(b.moveIn)}</dd>
            <dt>Due at move-in</dt><dd>{inr(b.rentPerBed + b.depositPerBed)} per person (first month {inr(b.rentPerBed)} + refundable deposit {inr(b.depositPerBed)}), paid to the PG</dd>
          </dl>
          {b.awaitingMe && <div className="chips"><button className="btn" onClick={() => run(b, 'accept', 'Booking accepted. Credits added.')}>Accept</button><button className="btn secondary" onClick={() => run(b, 'decline', 'Booking declined.')}>Decline</button></div>}
          {active && !b.awaitingMe && <button className="btn secondary" onClick={() => setConfirmCancel(b)}>Cancel booking</button>}
        </div>);
    })}
    {confirmCancel && (
      <Modal title="Cancel this booking?" onClose={() => setConfirmCancel(null)}>
        <p>Your reservation at {confirmCancel.pgName} is cancelled for everyone on it, and any credits it earned are taken back. Cancelling is free.</p>
        <div className="chips"><button className="btn danger" onClick={() => run(confirmCancel, 'cancel', 'Booking cancelled.')}>Cancel booking</button><button className="btn secondary" onClick={() => setConfirmCancel(null)}>Keep it</button></div>
      </Modal>)}
  </>);
}
