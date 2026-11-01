// Travel: ride groups to the station, bus stands and airports, with live group chat.
import { HttpError, readJson, need, today } from '../lib/http.js';

export const DESTS = ['Katpadi Railway Station', 'New Vellore Bus Stand', 'Old Bus Stand', 'Chittoor Bus Stand', 'Chennai Airport', 'Bangalore Airport'];
export const PICKUPS = ['Main Gate', 'Men’s Hostel gate', 'Ladies’ Hostel gate', 'PRP', 'SJT', 'TT'];

export default function travel(r, { store, live }) {
  const ride = (id) => { const x = store.get('rides', id); if (!x) throw new HttpError(404, 'NOT_FOUND', 'This ride no longer exists.'); return x; };
  const isMember = (x, uid) => x.members.some((m) => m.uid === uid);
  const view = (x, user) => ({
    ...x,
    members: x.members.map((m) => ({ uid: m.uid, name: m.name, joinedAt: m.joinedAt, ...(isMember(x, user.id) ? { phone: m.phone } : {}) })),
    seatsLeft: x.seats - x.members.length, mine: isMember(x, user.id), owner: x.createdBy === user.id,
    farePerPerson: x.fare ? Math.ceil(x.fare / Math.max(1, x.members.length)) : null,
  });
  const visibleTo = (x, user) => !x.girlsOnly || user.gender === 'female';
  const upcoming = (x) => x.date > today() || (x.date === today() && x.time >= new Date(Date.now() + 5.5 * 3600e3 - 60 * 60e3).toISOString().slice(11, 16));
  const pub = (x) => { live.publish('travel:list', { id: x.id }); live.publish(`travel:r:${x.id}`, { id: x.id }); };

  r.get('/api/travel/meta', 'student', () => ({ dests: DESTS, pickups: PICKUPS }));

  r.get('/api/travel/rides', 'student', ({ user, url }) => {
    const dest = url.searchParams.get('dest') || '';
    const date = url.searchParams.get('date') || '';
    const list = store.list('rides', (x) => upcoming(x) && visibleTo(x, user) && (!dest || x.dest === dest) && (!date || x.date === date))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    return { rides: list.map((x) => view(x, user)) };
  });

  r.post('/api/travel/rides', 'student', async ({ req, user }) => {
    const b = await readJson(req);
    const date = need.date(b.date, 'Date');
    if (date < today()) throw new HttpError(400, 'INVALID', 'Pick today or a later date.');
    const x = store.put('rides', {
      dest: need.oneOf(b.dest, 'Destination', DESTS),
      pickup: need.oneOf(b.pickup, 'Pickup point', PICKUPS),
      date, time: need.time(b.time, 'Time'),
      flex: need.int(b.flex ?? 15, 'Flexibility', { min: 0, max: 120 }),
      vehicle: need.oneOf(b.vehicle, 'Vehicle', ['auto', 'cab']),
      seats: need.int(b.seats, 'Seats', { min: 2, max: b.vehicle === 'auto' ? 3 : 7 }),
      girlsOnly: Boolean(b.girlsOnly) && user.gender === 'female',
      fare: b.fare === '' || b.fare == null ? null : need.int(b.fare, 'Estimated fare', { min: 0, max: 20000 }),
      train: String(b.train || '').trim().slice(0, 40),
      createdBy: user.id,
      members: [{ uid: user.id, name: user.name, phone: user.phone, gender: user.gender, joinedAt: new Date().toISOString() }],
    });
    pub(x); return { ride: view(x, user) };
  });

  r.get('/api/travel/rides/:id', 'student', ({ params, user }) => {
    const x = ride(params.id); if (!visibleTo(x, user)) throw new HttpError(404, 'NOT_FOUND', 'This ride no longer exists.');
    return { ride: view(x, user), messages: isMember(x, user.id) ? store.list('rideMessages', (m) => m.rideId === x.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-200) : [] };
  });

  r.post('/api/travel/rides/:id/join', 'student', ({ params, user }) => {
    const x = ride(params.id);
    if (!visibleTo(x, user)) throw new HttpError(403, 'GIRLS_ONLY', 'This ride is for girls only.');
    if (isMember(x, user.id)) return { ride: view(x, user) };
    if (x.members.length >= x.seats) throw new HttpError(409, 'FULL', 'This ride just filled up.');
    x.members.push({ uid: user.id, name: user.name, phone: user.phone, gender: user.gender, joinedAt: new Date().toISOString() });
    const u = store.patch('rides', x.id, { members: x.members });
    store.put('rideMessages', { rideId: x.id, uid: '', name: '', text: `${user.name} joined the ride.`, system: true });
    pub(u); return { ride: view(u, user) };
  });

  r.post('/api/travel/rides/:id/leave', 'student', ({ params, user }) => {
    const x = ride(params.id);
    if (!isMember(x, user.id)) return { ok: true };
    const members = x.members.filter((m) => m.uid !== user.id);
    if (!members.length) { store.remove('rides', x.id); for (const m of store.list('rideMessages', (m) => m.rideId === x.id)) store.remove('rideMessages', m.id); pub(x); return { ok: true, deleted: true }; }
    const u = store.patch('rides', x.id, { members, createdBy: x.createdBy === user.id ? members[0].uid : x.createdBy });
    store.put('rideMessages', { rideId: x.id, uid: '', name: '', text: `${user.name} left the ride.`, system: true });
    pub(u); return { ok: true };
  });

  r.post('/api/travel/rides/:id/messages', 'student', async ({ req, params, user }) => {
    const x = ride(params.id);
    if (!isMember(x, user.id)) throw new HttpError(403, 'NOT_MEMBER', 'Join the ride to chat with the group.');
    const { text } = await readJson(req);
    const m = store.put('rideMessages', { rideId: x.id, uid: user.id, name: user.name, text: need.str(text, 'Message', { max: 500 }) });
    live.publish(`travel:r:${x.id}`, { id: x.id, message: m.id });
    return { message: m };
  });

  return {
    topics(t, { user }) {
      if (t === 'travel:list') return Boolean(user);
      const m = t.match(/^travel:r:(.+)$/);
      if (m) { const x = store.get('rides', m[1]); return Boolean(user && x && isMember(x, user.id)); }
      return false;
    },
  };
}
