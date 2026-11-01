// Staff and admin: sign-in with staff ID + password, and the admin's tools.
import { HttpError, readJson, need, clientIp, limiter } from '../lib/http.js';
import { hashPassword, checkPassword, passwordProblem, randomPassword } from '../lib/password.js';
import { AMENITIES } from './pg.js';

export default function staffRoutes(r, { store, setStaffSession, clearStaffSession }) {
  const tries = limiter(15 * 60e3, 10);
  const out = (s) => ({ id: s.id, username: s.username, name: s.name, role: s.role, place: s.place, placeName: placeName(s), createdAt: s.createdAt });
  const placeName = (s) => (s.role === 'canteen' ? store.get('canteens', s.place)?.name : s.role === 'xerox' ? store.get('shops', s.place)?.name : 'Everything') || s.place;

  r.post('/api/staff/login', null, async ({ req, res }) => {
    if (!tries(clientIp(req))) throw new HttpError(429, 'RATE_LIMIT', 'Too many sign-in attempts. Wait 15 minutes and try again.');
    const b = await readJson(req);
    const username = String(b.username || '').trim().toLowerCase();
    const s = store.list('staff', (x) => x.username === username)[0];
    if (!s || !checkPassword(b.password, s.hash)) throw new HttpError(401, 'WRONG', 'That staff ID or password isn’t right.');
    if (b.expect && b.expect !== s.role && s.role !== 'admin') throw new HttpError(403, 'WRONG_ROLE', b.expect === 'canteen' ? 'This is a Xerox shop login. Use it on the Xerox staff page.' : 'This is a canteen login. Use it on the Food staff page.');
    setStaffSession(req, res, s);
    return { staff: out(s) };
  });
  r.post('/api/staff/logout', null, ({ req, res }) => { clearStaffSession(req, res); return { ok: true }; });
  r.get('/api/staff/me', 'staff', ({ staff }) => ({ staff: out(staff) }));
  r.post('/api/staff/password', 'staff', async ({ req, staff }) => {
    const b = await readJson(req);
    if (!checkPassword(b.current, staff.hash)) throw new HttpError(400, 'WRONG', 'Your current password isn’t right.');
    const p = passwordProblem(b.next); if (p) throw new HttpError(400, 'WEAK', p);
    store.patch('staff', staff.id, { hash: hashPassword(b.next) }); return { ok: true };
  });

  // ---------- admin ----------
  r.get('/api/admin/overview', 'admin', () => ({
    counts: {
      students: store.userCount(),
      staff: store.count('staff'), canteens: store.count('canteens'), shops: store.count('shops'),
      foodOrders: store.count('foodOrders'), xeroxOrders: store.count('xeroxOrders'), rides: store.count('rides'),
      pgListings: store.count('pgListings'), enquiries: store.list('pgEnquiries', (e) => e.status === 'NEW').length,
    },
    places: { canteen: store.list('canteens').map((c) => ({ id: c.id, name: c.name })), xerox: store.list('shops').map((s) => ({ id: s.id, name: s.name })) },
  }));

  r.get('/api/admin/staff', 'admin', () => ({ staff: store.list('staff').sort((a, b) => a.role.localeCompare(b.role) || a.username.localeCompare(b.username)).map(out) }));

  r.post('/api/admin/staff', 'admin', async ({ req }) => {
    const b = await readJson(req);
    const username = need.str(b.username, 'Staff ID', { min: 3, max: 30 }).toLowerCase();
    if (!/^[a-z0-9._-]+$/.test(username)) throw new HttpError(400, 'INVALID', 'Staff ID can use letters, numbers, dots, dashes and underscores.');
    if (store.list('staff', (x) => x.username === username).length) throw new HttpError(409, 'TAKEN', 'That staff ID is already in use.');
    const role = need.oneOf(b.role, 'Role', ['admin', 'canteen', 'xerox']);
    const place = role === 'admin' ? '' : need.str(b.place, 'Canteen or shop');
    if (role === 'canteen' && !store.get('canteens', place)) throw new HttpError(400, 'INVALID', 'Pick a canteen.');
    if (role === 'xerox' && !store.get('shops', place)) throw new HttpError(400, 'INVALID', 'Pick a Xerox shop.');
    const password = b.password ? String(b.password) : randomPassword();
    const p = passwordProblem(password); if (p) throw new HttpError(400, 'WEAK', p);
    const s = store.put('staff', { username, name: need.str(b.name || username, 'Name', { max: 60 }), role, place, hash: hashPassword(password) });
    return { staff: out(s), password };
  });

  r.post('/api/admin/staff/:id/reset', 'admin', ({ params }) => {
    const s = store.get('staff', params.id); if (!s) throw new HttpError(404, 'NOT_FOUND', 'Staff account not found.');
    const password = randomPassword(); store.patch('staff', s.id, { hash: hashPassword(password) });
    return { password };
  });

  r.del('/api/admin/staff/:id', 'admin', ({ params, staff }) => {
    if (params.id === staff.id) throw new HttpError(400, 'SELF', 'You can’t delete the account you’re signed in with.');
    const s = store.get('staff', params.id); if (!s) throw new HttpError(404, 'NOT_FOUND', 'Staff account not found.');
    if (s.role === 'admin' && store.list('staff', (x) => x.role === 'admin').length <= 1) throw new HttpError(400, 'LAST_ADMIN', 'Keep at least one admin.');
    store.remove('staff', s.id); return { ok: true };
  });

  r.post('/api/admin/canteens', 'admin', async ({ req }) => {
    const b = await readJson(req);
    const name = need.str(b.name, 'Canteen name', { max: 40 });
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!id || store.get('canteens', id)) throw new HttpError(409, 'TAKEN', 'A canteen with that name already exists.');
    const prefix = (String(b.prefix || name[0]).toUpperCase().match(/[A-Z]/) || ['C'])[0];
    return { canteen: store.put('canteens', { id, name, place: String(b.place || '').trim().slice(0, 60), prefix, open: true, sampleMenu: false }) };
  });

  const listingInput = (b) => ({
    name: need.str(b.name, 'PG name', { max: 60 }), area: need.str(b.area, 'Area', { max: 60 }),
    distanceKm: Math.round(Number(b.distanceKm) * 10) / 10 || 0,
    rent: need.int(b.rent, 'Monthly rent', { min: 500, max: 100000 }),
    gender: need.oneOf(b.gender, 'Who it’s for', ['male', 'female', 'any']),
    sharing: need.int(b.sharing, 'Sharing', { min: 1, max: 6 }),
    food: Boolean(b.food), amenities: (Array.isArray(b.amenities) ? b.amenities : []).filter((a) => AMENITIES.includes(a)),
    contactName: String(b.contactName || '').trim().slice(0, 60), contactPhone: String(b.contactPhone || '').trim().slice(0, 20), sample: false,
  });
  r.get('/api/admin/pg/listings', 'admin', () => ({ listings: store.list('pgListings').sort((a, b) => a.name.localeCompare(b.name)) }));
  r.post('/api/admin/pg/listings', 'admin', async ({ req }) => ({ listing: store.put('pgListings', listingInput(await readJson(req))) }));
  r.put('/api/admin/pg/listings/:id', 'admin', async ({ req, params }) => {
    if (!store.get('pgListings', params.id)) throw new HttpError(404, 'NOT_FOUND', 'Listing not found.');
    return { listing: store.patch('pgListings', params.id, listingInput(await readJson(req))) };
  });
  r.del('/api/admin/pg/listings/:id', 'admin', ({ params }) => ({ ok: store.remove('pgListings', params.id) }));
  r.get('/api/admin/pg/enquiries', 'admin', () => ({ enquiries: store.list('pgEnquiries').sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }));
  r.post('/api/admin/pg/enquiries/:id', 'admin', async ({ req, params }) => {
    const { status } = await readJson(req);
    if (!store.get('pgEnquiries', params.id)) throw new HttpError(404, 'NOT_FOUND', 'Enquiry not found.');
    return { enquiry: store.patch('pgEnquiries', params.id, { status: need.oneOf(status, 'Status', ['NEW', 'CONTACTED', 'CLOSED']) }) };
  });

  return { topics: () => false };
}
