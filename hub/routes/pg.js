// PG: listings, saved PGs, enquiries, and same-gender roommate matching with mutual connect.
import { HttpError, readJson, need } from '../lib/http.js';

export const TAGS = ['Early riser', 'Night owl', 'Vegetarian', 'Non-smoker', 'Quiet', 'Social', 'Gym', 'Studies late', 'Cooks', 'Pet friendly', 'Clean & tidy', 'Music'];
export const AMENITIES = ['Wi-Fi', 'AC', 'Mess', 'Laundry', 'CCTV', 'Warden', 'Attached bath', 'Power backup', 'Parking', 'Gym', 'Housekeeping', 'Hot water'];

export default function pg(r, { store }) {
  const listing = (id) => { const l = store.get('pgListings', id); if (!l) throw new HttpError(404, 'NOT_FOUND', 'That PG is no longer listed.'); return l; };
  const savedIds = (uid) => new Set(store.list('pgSaves', (s) => s.uid === uid).map((s) => s.listingId));
  const pub = (l, saved) => ({ ...l, contactPhone: undefined, saved: saved.has(l.id) });

  r.get('/api/pg/meta', 'student', () => ({ tags: TAGS, amenities: AMENITIES }));

  r.get('/api/pg/listings', 'student', ({ user, url }) => {
    const max = Number(url.searchParams.get('maxRent')) || Infinity;
    const onlyMine = url.searchParams.get('for') !== 'all';
    const saved = savedIds(user.id);
    const list = store.list('pgListings', (l) => l.rent <= max && (!onlyMine || l.gender === 'any' || l.gender === user.gender))
      .sort((a, b) => a.distanceKm - b.distanceKm);
    return { listings: list.map((l) => pub(l, saved)) };
  });

  r.post('/api/pg/listings/:id/save', 'student', ({ params, user }) => {
    const l = listing(params.id); const id = `${user.id}:${l.id}`;
    if (store.get('pgSaves', id)) { store.remove('pgSaves', id); return { saved: false }; }
    store.put('pgSaves', { id, uid: user.id, listingId: l.id }); return { saved: true };
  });

  r.post('/api/pg/listings/:id/enquire', 'student', async ({ req, params, user }) => {
    const l = listing(params.id); const b = await readJson(req);
    const dup = store.list('pgEnquiries', (e) => e.uid === user.id && e.listingId === l.id && e.status === 'NEW');
    if (dup.length) throw new HttpError(409, 'DUPLICATE', 'You’ve already asked about this PG. The team will get back to you.');
    const e = store.put('pgEnquiries', {
      listingId: l.id, listingName: l.name, uid: user.id, name: user.name, phone: user.phone, email: user.email, gender: user.gender,
      moveIn: b.moveIn ? need.date(b.moveIn, 'Move-in date') : '', message: String(b.message || '').trim().slice(0, 500), status: 'NEW',
    });
    return { enquiry: { id: e.id } };
  });

  r.get('/api/pg/enquiries/mine', 'student', ({ user }) => ({
    enquiries: store.list('pgEnquiries', (e) => e.uid === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  }));

  // Roommate profile: id is the student's id
  r.get('/api/pg/profile', 'student', ({ user }) => ({ profile: store.get('pgProfiles', user.id) }));
  r.put('/api/pg/profile', 'student', async ({ req, user }) => {
    const b = await readJson(req);
    const tags = Array.isArray(b.tags) ? b.tags.filter((t) => TAGS.includes(t)).slice(0, 6) : [];
    const p = store.put('pgProfiles', {
      ...(store.get('pgProfiles', user.id) || {}), id: user.id, uid: user.id, name: user.name, gender: user.gender,
      moveIn: need.date(b.moveIn, 'Move-in date'),
      budgetMax: need.int(b.budgetMax, 'Budget', { min: 1000, max: 100000 }),
      area: String(b.area || '').trim().slice(0, 60), tags, about: String(b.about || '').trim().slice(0, 300), visible: b.visible !== false,
    });
    return { profile: p };
  });

  r.get('/api/pg/matches', 'student', ({ user }) => {
    const me = store.get('pgProfiles', user.id);
    if (!me) return { matches: [], needsProfile: true };
    const day = (d) => new Date(d + 'T00:00:00Z').getTime() / 86400e3;
    const sentByMe = new Set(store.list('pgConnects', (c) => c.from === user.id).map((c) => c.to));
    const sentToMe = new Set(store.list('pgConnects', (c) => c.to === user.id).map((c) => c.from));
    const matches = store.list('pgProfiles', (p) => p.uid !== user.id && p.visible && p.gender === user.gender && Math.abs(day(p.moveIn) - day(me.moveIn)) <= 30)
      .map((p) => {
        const shared = p.tags.filter((t) => me.tags.includes(t));
        const budgetGap = Math.abs(p.budgetMax - me.budgetMax);
        const score = shared.length * 10 - Math.abs(day(p.moveIn) - day(me.moveIn)) / 3 - budgetGap / 1000;
        const mutual = sentByMe.has(p.uid) && sentToMe.has(p.uid);
        const u = mutual ? store.userById(p.uid) : null;
        return { uid: p.uid, name: p.name, moveIn: p.moveIn, budgetMax: p.budgetMax, area: p.area, tags: p.tags, about: p.about, shared,
          iConnected: sentByMe.has(p.uid), theyConnected: sentToMe.has(p.uid), mutual, phone: u ? u.phone : undefined, email: u ? u.email : undefined, score };
      })
      .sort((a, b) => b.score - a.score);
    return { matches };
  });

  r.post('/api/pg/connect/:uid', 'student', ({ params, user }) => {
    const other = store.get('pgProfiles', params.uid);
    const me = store.get('pgProfiles', user.id);
    if (!me) throw new HttpError(409, 'PROFILE', 'Fill in your roommate profile first.');
    if (!other || other.gender !== user.gender || !other.visible) throw new HttpError(404, 'NOT_FOUND', 'That student isn’t looking for roommates any more.');
    const id = `${user.id}:${other.uid}`;
    if (store.get('pgConnects', id)) { store.remove('pgConnects', id); return { connected: false }; }
    store.put('pgConnects', { id, from: user.id, to: other.uid }); return { connected: true };
  });

  return { topics: () => false };
}
