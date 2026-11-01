// Sign-in lives in UniHub. This file has two small pages:
//  /sso    UniHub sends the student here with a signed token; we trade it for a session.
//  /login  Test-student picker for development and demos (hidden when the server has it switched off).
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Field, Spinner } from '../components/ui.jsx';

const Card = ({ title, children }) => <div className="auth-wrap"><div className="card"><h1>{title}</h1>{children}</div></div>;
const Err = ({ msg }) => msg ? <div className="alert err" role="alert">{msg}</div> : null;

export function Sso() {
  const nav = useNavigate(), { setUser } = useAuth(), [params] = useSearchParams(), [error, setError] = useState('');
  useEffect(() => {
    const token = params.get('token');
    if (!token) { setError('Open PlaceMate from UniHub to sign in.'); return; }
    api.post('/auth/sso', { token })
      .then((d) => { setUser(d.user); nav('/matches', { replace: true }); })
      .catch((e) => setError(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return error ? <Card title="Could not sign you in"><Err msg={error} /></Card> : <Spinner />;
}

/** TESTING ONLY. Stands in for UniHub's login: it asks name and gender once, then opens PlaceMate. The real UniHub does this part. */
export function Login() {
  const nav = useNavigate();
  const [off, setOff] = useState(false), [f, setF] = useState({ name: '', gender: '' }), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const go = async (w) => {
    setBusy(true); setError('');
    try { const { token } = await api.post('/auth/dev/unihub-token', w); nav('/sso?token=' + encodeURIComponent(token), { replace: true }); }
    catch (e) { if (e.status === 404) setOff(true); else setError(e.message); setBusy(false); }
  };
  // A link like /?as=Priya&g=female skips the form (handy for testing two students).
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get('as') && ['male', 'female'].includes(q.get('g'))) go({ name: q.get('as'), gender: q.get('g') });
    else { setAuto(false); api.post('/auth/dev/unihub-token', { name: 'check', gender: 'male' }).catch((e) => { if (e.status === 404) setOff(true); }); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (off) return <Card title="Open PlaceMate from UniHub"><p>Sign in to UniHub with your credentials, then choose PlaceMate.</p></Card>;
  if (auto) return <Spinner />;
  return (
    <Card title="Welcome to PlaceMate">
      <Err msg={error} />
      <form onSubmit={(e) => { e.preventDefault(); go(f); }}>
        <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} autoFocus /></Field>
        <Field label="Gender"><select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })} required>
          <option value="">Choose…</option><option value="male">Male</option><option value="female">Female</option></select></Field>
        <button className="btn block" disabled={busy}>{busy ? 'Please wait…' : 'Continue'}</button>
      </form>
    </Card>);
}

/** Shown once, before anything else, until the student accepts the Terms and Privacy Policy. */
export function Consent() {
  const { setUser, logout } = useAuth(), [ok, setOk] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { setUser((await api.post('/auth/consent', { accept: true })).user); } catch (x) { setError(x.message); setBusy(false); }
  };
  return (
    <Card title="Before you start">
      <p>PlaceMate uses your name, VIT email, registration number, gender, office location and preferences to match you with other students, run chats and reservations, and keep the service safe. Your registration number is never shown to other students.</p>
      <Err msg={error} />
      <form onSubmit={submit}>
        <label className="inline"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
          <span>I am 18 or older and I agree to the <Link to="/legal/terms" target="_blank">Terms of Use</Link> and the <Link to="/legal/privacy" target="_blank">Privacy Policy</Link>, and I consent to my data being used as described.</span></label>
        <div className="chips" style={{ marginTop: 16 }}>
          <button className="btn" disabled={!ok || busy}>{busy ? 'Please wait…' : 'Agree and continue'}</button>
          <button type="button" className="btn secondary" onClick={logout}>No thanks</button>
        </div>
      </form>
    </Card>);
}
