// Credits balance and history.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gift } from 'lucide-react';
import { api } from '../api.js';
import { useMeta } from '../useMeta.js';
import { Empty, Spinner } from '../components/ui.jsx';

export default function Credits() {
  const [d, setD] = useState(null), { meta } = useMeta();
  useEffect(() => { api.get('/bookings/credits').then(setD).catch(() => setD({ balance: 0, history: [] })); }, []);
  if (!d) return <Spinner />;
  return (<>
    <div className="banner"><div><p>Your credits</p><h1>{d.balance}</h1></div><Gift size={36} aria-hidden="true" /></div>
    <div className="card" style={{ marginTop: 16 }}>
      <h2>How credits work</h2>
      <p>You earn {meta?.creditsPerBooking ?? 100} credits when a PG booking made through PlaceMate is confirmed. If you book together, both roommates earn them. If a confirmed booking is cancelled, the credits it earned are taken back.</p>
      <p className="hint">Credits are reward points with no cash value; ways to use them will be announced.</p>
    </div>
    <h2>History</h2>
    {d.history.length === 0
      ? <Empty title="No credits yet" text="Reserve a PG to earn your first credits." action={<Link className="btn" to="/pgs">Find PGs</Link>} />
      : d.history.map((h, i) => (
        <div className="row" style={{ cursor: 'default' }} key={i}>
          <span className="grow"><strong>{h.reason}</strong><br /><span className="meta">{new Date(h.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span></span>
          <strong style={{ color: h.delta < 0 ? 'var(--danger)' : 'var(--ok)' }}>{h.delta > 0 ? '+' : ''}{h.delta}</strong>
        </div>))}
  </>);
}
