// Placement profile: company, office, max distance, optional details and preferences.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Field, Spinner } from '../components/ui.jsx';
import TagPicker from '../components/TagPicker.jsx';
import { todayStr } from '../dates.js';

export default function Profile() {
  const { profile, loadProfile } = useAuth(), toast = useToast(), nav = useNavigate();
  const [meta, setMeta] = useState(null), [f, setF] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { api.get('/meta').then(setMeta); }, []);
  useEffect(() => {
    if (profile === undefined) return;
    setF(profile ? { ...profile, moveInFrom: profile.moveInFrom || '', moveInTo: profile.moveInTo || '', moveInDate: profile.moveInDate || '', budget: profile.budget ?? '', bio: profile.bio || '' }
      : { company: '', hubId: '', maxDistanceKm: 10, moveInFrom: '', moveInTo: '', moveInDate: '', budget: '', bio: '', tags: [], priorities: [] });
  }, [profile]);
  if (!meta || !f) return <Spinner />;

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const byCity = meta.hubs.reduce((m, h) => ({ ...m, [h.city]: [...(m[h.city] || []), h] }), {});
  const isNew = !profile?.moveInDate, today = todayStr();

  const save = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await api.put('/profile', { ...f, budget: f.budget === '' ? null : Number(f.budget), maxDistanceKm: Number(f.maxDistanceKm) });
      await loadProfile(); toast('Profile saved.');
      if (isNew) nav('/matches');
    } catch (err) { setError(err.message); window.scrollTo({ top: 0, behavior: 'smooth' }); } finally { setBusy(false); }
  };

  return (
    <form className="card" onSubmit={save}>
      <h2>{isNew ? 'Set up your placement profile' : 'My profile'}</h2>
      <p className="hint">Fields marked * are required. Everything else is optional.</p>
      {error && <div className="alert err" role="alert">{error}</div>}
      <fieldset>
        <legend>When are you moving in? *</legend>
        <p className="hint">Pick the dates you could move in, then your exact date. You are shown to students whose dates overlap with yours, and they see your exact date.</p>
        <Field label="Earliest date I could move in *"><input type="date" min={today} value={f.moveInFrom} onChange={set('moveInFrom')} required /></Field>
        <Field label="Latest date I could move in *"><input type="date" min={f.moveInFrom || today} value={f.moveInTo} onChange={set('moveInTo')} required /></Field>
        <Field label="My exact move-in date *" hint="Must be between the two dates above."><input type="date" min={f.moveInFrom || today} max={f.moveInTo || undefined} value={f.moveInDate} onChange={set('moveInDate')} required /></Field>
      </fieldset>
      <Field label="Company *"><input list="companies" value={f.company} onChange={set('company')} required /><datalist id="companies">{meta.companies.map((c) => <option key={c} value={c} />)}</datalist></Field>
      <Field label="Office location *">
        <select value={f.hubId} onChange={set('hubId')} required><option value="">Choose your office area</option>
          {Object.entries(byCity).map(([city, hs]) => <optgroup key={city} label={city}>{hs.map((h) => <option key={h.id} value={h.id}>{h.area}</option>)}</optgroup>)}
        </select>
      </Field>
      <Field label="Max distance from office (km) *" hint="Students and PGs farther than this are hidden. Any value from 1 to 200."><input type="number" min="1" max="200" step="1" inputMode="numeric" value={f.maxDistanceKm} onChange={set('maxDistanceKm')} required /></Field>
      <Field label="Monthly budget (₹)"><input type="number" min="1000" max="200000" step="500" value={f.budget} onChange={set('budget')} /></Field>
      <Field label="About you" hint={`${f.bio.length}/300`}><textarea rows="3" maxLength={300} value={f.bio} onChange={set('bio')} /></Field>
      <h3>Roommate preferences</h3>
      <p className="hint">Optional. Tap what describes you or what you want in a roommate. Students who share your choices rank higher.</p>
      <TagPicker groups={meta.tagGroups} tags={f.tags} priorities={f.priorities} onChange={(tags, priorities) => setF({ ...f, tags, priorities })} />
      <button className="btn block" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
    </form>
  );
}
