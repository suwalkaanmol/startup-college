// Report and Block for another student.
import { useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../context/ToastContext.jsx';

const REASONS = [['fake_profile', 'Fake profile'], ['harassment', 'Harassment'], ['inappropriate', 'Inappropriate behaviour'], ['scam', 'Scam'], ['other', 'Other']];

export default function SafetyActions({ userId, name, onBlocked }) {
  const toast = useToast();
  const [mode, setMode] = useState(null), [reason, setReason] = useState(''), [details, setDetails] = useState('');
  const report = async () => {
    try { await api.post('/safety/report', { userId, reason, details: details || undefined }); toast('Report sent. Thank you.'); setMode(null); }
    catch (e) { toast(e.message, 'err'); }
  };
  const block = async () => {
    try { await api.post('/safety/block', { userId }); toast(`${name} is blocked.`); onBlocked?.(); }
    catch (e) { toast(e.message, 'err'); }
  };
  if (!mode) return <div className="chips" style={{ marginTop: 12 }}><button className="btn secondary" onClick={() => setMode('report')}>Report</button><button className="btn secondary" onClick={() => setMode('block')}>Block</button></div>;
  if (mode === 'block') return (
    <div className="card" style={{ marginTop: 12 }}>
      <p>Block {name}? You will not see each other, pending requests are cancelled, and you leave any group you share.</p>
      <div className="chips"><button className="btn danger" onClick={block}>Block {name}</button><button className="btn secondary" onClick={() => setMode(null)}>Keep</button></div>
    </div>);
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <fieldset><legend>Why are you reporting {name}?</legend>
        <div className="seg">{REASONS.map(([id, label]) => <button type="button" key={id} className={reason === id ? 'on' : ''} aria-pressed={reason === id} onClick={() => setReason(id)}>{label}</button>)}</div></fieldset>
      <label className="field"><span className="label">Details (optional)</span><textarea rows="3" maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} /></label>
      <div className="chips"><button className="btn" disabled={!reason} onClick={report}>Send report</button><button className="btn secondary" onClick={() => setMode(null)}>Cancel</button></div>
    </div>);
}
