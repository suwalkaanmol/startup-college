// Account details, theme, data download and account deletion.
import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../api.js';
import { Modal } from '../components/ui.jsx';

const MODES = [['system', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']];

export default function Settings() {
  const { user, logout } = useAuth(), { mode, setMode } = useTheme(), toast = useToast();
  const [del, setDel] = useState(false), [pw, setPw] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);

  const download = async () => {
    try {
      const data = await api.get('/account/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: 'placemate-my-data.json' });
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast('Your data was downloaded.');
    } catch (e) { toast(e.message, 'err'); }
  };
  const remove = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api.del('/account', { confirm: pw }); toast('Your account was deleted.'); await logout(); }
    catch (x) { setErr(x.message); setBusy(false); }
  };

  return (<>
    <div className="card"><h2>Account</h2>
      <dl className="facts"><dt>Name</dt><dd>{user.name}</dd><dt>Email</dt><dd>{user.email}</dd><dt>Registration no.</dt><dd>{user.regNo}</dd></dl>
      <p className="hint">Your registration number is never shown to other students.</p></div>
    <div className="card"><h2>Appearance</h2>
      <fieldset><legend className="hint">Theme</legend><div className="seg">{MODES.map(([m, l]) => <button type="button" key={m} className={mode === m ? 'on' : ''} aria-pressed={mode === m} onClick={() => setMode(m)}>{l}</button>)}</div></fieldset></div>
    <div className="card"><h2>Your data</h2>
      <p>Download everything PlaceMate holds about you as a JSON file, or delete your account and data.</p>
      <div className="chips"><button className="btn secondary" onClick={download}>Download my data</button><button className="btn danger" onClick={() => setDel(true)}>Delete my account</button></div></div>
    {del && (
      <Modal title="Delete your account?" onClose={() => setDel(false)}>
        <form onSubmit={remove}>
          <p>This permanently deletes your profile, requests, chats and credits. Active bookings are cancelled, and credits earned on them are taken back from everyone on the booking. This cannot be undone.</p>
          <label className="field"><span className="label">Type DELETE to confirm</span><input autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
          {err && <div className="alert err" role="alert">{err}</div>}
          <div className="chips"><button className="btn danger" disabled={busy || pw !== 'DELETE'}>{busy ? 'Deleting…' : 'Delete my account'}</button><button type="button" className="btn secondary" onClick={() => setDel(false)}>Keep my account</button></div>
        </form>
      </Modal>)}
  </>);
}
