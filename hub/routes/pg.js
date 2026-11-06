// PG Mate: after placements, find VIT students joining work in the same city and area around the same time,
// meet them on campus while you're both still here, then move in together. Contacts show only when both connect.
import { HttpError, readJson, need, today } from '../lib/http.js';

export const TAGS = ['Early riser', 'Night owl', 'Vegetarian', 'Non-vegetarian', 'Non-smoker', 'Quiet', 'Social', 'Gym', 'Cooks', 'Clean & tidy', 'Music', 'Weekend trips', 'Work from office', 'Hybrid work'];
export const AMENITIES = ['Wi-Fi', 'AC', 'Food', 'Laundry', 'CCTV', 'Power backup', 'Attached bath', 'Housekeeping', 'Hot water', 'Gym', 'Parking', 'Lift'];
// Office areas from the PG team's PlaceMate list.
export const AREAS = {
  Bengaluru: ['Whitefield (ITPL)', 'Bellandur / ORR', 'Electronic City', 'Manyata Tech Park', 'Koramangala', 'Bagmane / CV Raman Nagar'],
  Hyderabad: ['HITEC City', 'Gachibowli', 'Financial District'],
  Chennai: ['OMR Sholinganallur', 'Perungudi / Taramani', 'Guindy', 'Siruseri SIPCOT'],
  Pune: ['Hinjewadi', 'Kharadi', 'Magarpatta'],
  Mumbai: ['Powai', 'BKC'],
  'Delhi NCR': ['Gurugram Cyber City', 'Noida Sector 62'],
  Kolkata: ['Salt Lake Sector V'], Kochi: ['Infopark'], Trivandrum: ['Technopark'], Coimbatore: ['Tidel Park'], Mysuru: ['Hebbal Industrial Area'],
};
const DATE_WINDOW = 45; // joining dates within this many days are matched
const day = (d) => new Date(d + 'T00:00:00Z').getTime() / 86400e3;

// "24BCE1234" -> "BCE · 2024 batch"
export const batchOf = (regNo) => { const m = String(regNo || '').match(/^(\d{2})([A-Z]{2,4})/); return m ? `${m[2]} · 20${m[1]} batch` : ''; };

export default function pg(r, { store }) {
  const listing = (id) => { const l = store.get('pgListings', id); if (!l) throw new HttpError(404, 'NOT_FOUND', 'That PG is no longer listed.'); return l; };
  const savedIds = (uid) => new Set(store.list('pgSaves', (s) => s.uid === uid).map((s) => s.listingId));
  const pubListing = (l, saved) => ({ ...l, contactPhone: undefined, saved: saved.has(l.id) });
  const profile = (uid) => { const p = store.get('pgProfiles', uid); return p && p.city ? p : null; }; // first-version profiles had no city

  r.get('/api/pg/meta', 'student', () => ({ tags: TAGS, amenities: AMENITIES, areas: AREAS }));

  // ---------- my placement profile ----------
  r.get('/api/pg/profile', 'student', ({ user }) => ({ profile: profile(user.id), old: Boolean(store.get('pgProfiles', user.id) && !profile(user.id)) }));
  r.put('/api/pg/profile', 'student', async ({ req, user }) => {
    const b = await readJson(req);
    const city = need.str(b.city, 'Job city', { max: 40 });
    const known = AREAS[city];
    const area = known ? (b.area && known.includes(b.area) ? b.area : String(b.area || '').trim().slice(0, 60)) : String(b.area || '').trim().slice(0, 60);
    const joinDate = need.date(b.joinDate, 'Joining date');
    if (joinDate < today()) throw new HttpError(400, 'INVALID', 'Your joining date has passed. Pick the date you start work.');
    const campusTill = b.campusTill ? need.date(b.campusTill, 'On campus till') : '';
    const p = store.put('pgProfiles', {
      ...(store.get('pgProfiles', user.id) || {}), id: user.id, uid: user.id, name: user.name, gender: user.gender, batch: batchOf(user.regNo),
      company: need.str(b.company, 'Company', { max: 60 }), city, area, joinDate, campusTill,
      budgetMax: need.int(b.budgetMax, 'Budget', { min: 2000, max: 200000 }),
      roommates: need.int(b.roommates ?? 1, 'Roommates wanted', { min: 1, max: 4 }),
      tags: Array.isArray(b.tags) ? b.tags.filter((t) => TAGS.includes(t)).slice(0, 6) : [],
      about: String(b.about || '').trim().slice(0, 300), meetAt: String(b.meetAt || '').trim().slice(0, 80), visible: b.visible !== false,
    });
    return { profile: p };
  });

  // ---------- matches ----------
  function people(user) {
    const me = profile(user.id);
    if (!me) return null;
    const sentByMe = new Set(store.list('pgConnects', (c) => c.from === user.id).map((c) => c.to));
    const sentToMe = new Set(store.list('pgConnects', (c) => c.to === user.id).map((c) => c.from));
    return store.list('pgProfiles', (p) => p.uid !== user.id && p.city && p.gender === user.gender && (p.visible || sentByMe.has(p.uid) || sentToMe.has(p.uid)) && p.city.toLowerCase() === me.city.toLowerCase())
      .map((p) => {
        const gap = Math.abs(day(p.joinDate) - day(me.joinDate));
        const shared = p.tags.filter((t) => me.tags.includes(t));
        const sameArea = Boolean(p.area && me.area && p.area.toLowerCase() === me.area.toLowerCase());
        const sameCompany = p.company.trim().toLowerCase() === me.company.trim().toLowerCase();
        const score = Math.max(0, Math.min(100, Math.round(40 + (sameArea ? 25 : 0) + (sameCompany ? 15 : 0) + shared.length * 6 - gap / 2 - Math.abs(p.budgetMax - me.budgetMax) / 1000)));
        const mutual = sentByMe.has(p.uid) && sentToMe.has(p.uid);
        const u = mutual ? store.userById(p.uid) : null;
        return {
          uid: p.uid, name: p.name, batch: p.batch, company: p.company, city: p.city, area: p.area, joinDate: p.joinDate, campusTill: p.campusTill,
          budgetMax: p.budgetMax, roommates: p.roommates, tags: p.tags, about: p.about, meetAt: p.meetAt, shared, sameArea, sameCompany, gap, score,
          iConnected: sentByMe.has(p.uid), theyConnected: sentToMe.has(p.uid), mutual, phone: u?.phone, email: u?.email,
        };
      })
      .filter((m) => m.gap <= DATE_WINDOW || m.iConnected || m.theyConnected)
      .sort((a, b) => b.score - a.score);
  }
  r.get('/api/pg/matches', 'student', ({ user }) => {
    const list = people(user);
    if (!list) return { matches: [], needsProfile: true };
    return { matches: list, me: profile(user.id) };
  });

  r.post('/api/pg/connect/:uid', 'student', ({ params, user }) => {
    if (!profile(user.id)) throw new HttpError(409, 'PROFILE', 'Fill in your placement details first.');
    const other = profile(params.uid);
    if (!other || other.gender !== user.gender) throw new HttpError(404, 'NOT_FOUND', 'That student isn’t looking for PG mates any more.');
    const id = `${user.id}:${other.uid}`;
    if (store.get('pgConnects', id)) { store.remove('pgConnects', id); return { connected: false }; }
    store.put('pgConnects', { id, from: user.id, to: other.uid }); return { connected: true };
  });

  // ---------- PGs near the office ----------
  r.get('/api/pg/listings', 'student', ({ user, url }) => {
    const max = Number(url.searchParams.get('maxRent')) || Infinity;
    const city = url.searchParams.get('city') || profile(user.id)?.city || '';
    const saved = savedIds(user.id);
    const list = store.list('pgListings', (l) => l.rent <= max && (l.gender === 'any' || l.gender === user.gender) && (!city || (l.city || '').toLowerCase() === city.toLowerCase()))
      .sort((a, b) => (a.area || '').localeCompare(b.area || '') || a.rent - b.rent);
    return { listings: list.map((l) => pubListing(l, saved)), city };
  });

  r.post('/api/pg/listings/:id/save', 'student', ({ params, user }) => {
    const l = listing(params.id); const id = `${user.id}:${l.id}`;
    if (store.get('pgSaves', id)) { store.remove('pgSaves', id); return { saved: false }; }
    store.put('pgSaves', { id, uid: user.id, listingId: l.id }); return { saved: true };
  });

  r.post('/api/pg/listings/:id/enquire', 'student', async ({ req, params, user }) => {
    const l = listing(params.id); const b = await readJson(req);
    if (l.sample) throw new HttpError(409, 'SAMPLE', 'This is a sample listing, so it can’t be booked.');
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

  return {
    topics: () => false,
    attention(uid) {
      const mineSent = new Set(store.list('pgConnects', (c) => c.from === uid).map((c) => c.to));
      return store.list('pgConnects', (c) => c.to === uid && !mineSent.has(c.from)).map((c) => ({ source: 'pg', tone: 'live', title: `${store.get('pgProfiles', c.from)?.name || 'Someone'} wants to connect as PG mates`, detail: 'Connect back to see each other’s number.', href: 'pg/index.html', at: c.createdAt }));
    },
  };
}
