// Travel: share a cab or auto between campus (or your hostel block) and the station, bus stands or airports,
// in either direction. Riders ask to join, the person who offered the ride accepts, and the group chats privately.
import { HttpError, readJson, need, today } from '../lib/http.js';

export const CITY = ['Katpadi Railway Station', 'New Vellore Bus Stand', 'Old Bus Stand', 'Chittoor Bus Stand', 'Chennai Airport', 'Bangalore Airport'];
export const CAMPUS = ['Main Gate', 'RJT', 'PRP', 'SJT', 'TT'];
// Hostel blocks from the Travel team's list. Students pick only blocks of their own hostel.
const GIRLS = 'ABCDEFGHJS'.split(''), BOYS = 'ABCDEGHJKLMNPQRT'.split('');
export const HOSTELS = { female: GIRLS.map((b) => `Ladies’ Hostel ${b} block`), male: BOYS.map((b) => `Men’s Hostel ${b} block`) };
const isCampusFor = (p, gender) => CAMPUS.includes(p) || (HOSTELS[gender] || []).includes(p);
const MATCH_MIN = 60; // rides leaving within an hour of each other are offered as matches
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

export default function travel(r, { store, live }) {
  // Rides from the first version had dest + pickup and a fixed size.
  for (const x of store.list('rides', (y) => !y.from)) store.patch('rides', x.id, { from: x.pickup, to: x.dest, dir: 'out', city: x.dest, maxPeople: x.seats, minPeople: 2, requests: [] });

  const ride = (id) => { const x = store.get('rides', id); if (!x) throw new HttpError(404, 'NOT_FOUND', 'This ride no longer exists.'); return x; };
  const isMember = (x, uid) => x.members.some((m) => m.uid === uid);
  const reqOf = (x, uid) => (x.requests || []).find((q) => q.uid === uid && q.status === 'PENDING');
  const view = (x, user) => {
    const member = isMember(x, user.id), owner = x.createdBy === user.id;
    return {
      id: x.id, from: x.from, to: x.to, dir: x.dir, city: x.city, date: x.date, time: x.time, flex: x.flex, vehicle: x.vehicle,
      maxPeople: x.maxPeople, minPeople: x.minPeople, girlsOnly: x.girlsOnly, fare: x.fare, train: x.train, createdAt: x.createdAt,
      members: x.members.map((m) => ({ uid: m.uid, name: m.name, owner: m.uid === x.createdBy, ...(member ? { phone: m.phone } : {}) })),
      seatsLeft: x.maxPeople - x.members.length, going: x.members.length >= x.minPeople,
      mine: member, owner, requested: Boolean(reqOf(x, user.id)),
      requests: owner ? (x.requests || []).filter((q) => q.status === 'PENDING').map((q) => ({ uid: q.uid, name: q.name, note: q.note, at: q.at, regNo: q.regNo })) : undefined,
      farePerPerson: x.fare ? Math.ceil(x.fare / Math.max(1, x.members.length)) : null,
    };
  };
  const visibleTo = (x, user) => !x.girlsOnly || user.gender === 'female';
  const nowIst = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(11, 16);
  const upcoming = (x) => x.date > today() || (x.date === today() && toMin(x.time) >= toMin(nowIst()) - 60);
  const pub = (x, ...uids) => { live.publish('travel:list', { id: x.id }); live.publish(`travel:r:${x.id}`, { id: x.id }); for (const u of uids) live.publish(`travel:u:${u}`, { id: x.id }); };
  const system = (x, text) => store.put('rideMessages', { rideId: x.id, uid: '', name: '', text, system: true });

  r.get('/api/travel/meta', 'student', ({ user }) => ({ city: CITY, campus: CAMPUS, hostels: HOSTELS[user.gender] || [], hostelLabel: user.gender === 'female' ? 'Ladies’ hostel' : 'Men’s hostel' }));

  // A route is campus (or your hostel block) <-> a station, bus stand or airport, either way round.
  function route(b, user) {
    const from = String(b.from || ''), to = String(b.to || '');
    if (!from || !to) throw new HttpError(400, 'INVALID', 'Choose where you start and where you’re going.');
    if (from === to) throw new HttpError(400, 'INVALID', 'Start and destination are the same.');
    const out = isCampusFor(from, user.gender) && CITY.includes(to), back = CITY.includes(from) && isCampusFor(to, user.gender);
    if (!out && !back) {
      if ([...HOSTELS.male, ...HOSTELS.female].some((h) => h === from || h === to)) throw new HttpError(400, 'INVALID', 'Choose a block of your own hostel.');
      throw new HttpError(400, 'INVALID', 'One end of the ride must be on campus and the other a station, bus stand or airport.');
    }
    return { from, to, dir: out ? 'out' : 'in', city: out ? to : from };
  }

  r.get('/api/travel/rides', 'student', ({ user, url }) => {
    const city = url.searchParams.get('city') || '', date = url.searchParams.get('date') || '', dir = url.searchParams.get('dir') || '';
    const list = store.list('rides', (x) => upcoming(x) && visibleTo(x, user) && (!city || x.city === city) && (!date || x.date === date) && (!dir || x.dir === dir))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    return { rides: list.map((x) => view(x, user)) };
  });

  // While offering a ride: rides already going the same way at about the same time, so no duplicate is made.
  r.get('/api/travel/matches', 'student', ({ user, url }) => {
    const rt = route({ from: url.searchParams.get('from'), to: url.searchParams.get('to') }, user);
    const date = need.date(url.searchParams.get('date'), 'Date'), time = need.time(url.searchParams.get('time'), 'Time');
    const list = store.list('rides', (x) => upcoming(x) && visibleTo(x, user) && x.dir === rt.dir && x.city === rt.city && x.date === date
      && Math.abs(toMin(x.time) - toMin(time)) <= Math.max(MATCH_MIN, (x.flex || 0) + 30) && !isMember(x, user.id) && x.members.length < x.maxPeople)
      .sort((a, b) => Math.abs(toMin(a.time) - toMin(time)) - Math.abs(toMin(b.time) - toMin(time)));
    return { rides: list.slice(0, 5).map((x) => view(x, user)) };
  });

  r.post('/api/travel/rides', 'student', async ({ req, user }) => {
    const b = await readJson(req);
    const rt = route(b, user);
    const date = need.date(b.date, 'Date');
    if (date < today()) throw new HttpError(400, 'INVALID', 'Pick today or a later date.');
    const time = need.time(b.time, 'Time');
    if (date === today() && toMin(time) < toMin(nowIst()) - 10) throw new HttpError(400, 'INVALID', 'That time has already passed today. Pick a later time or another day.');
    const vehicle = need.oneOf(b.vehicle, 'Vehicle', ['auto', 'cab']);
    const maxPeople = need.int(b.maxPeople, 'Most people', { min: 2, max: vehicle === 'auto' ? 3 : 7 });
    const minPeople = b.minPeople === 'any' || b.minPeople == null ? 2 : need.int(b.minPeople, 'Fewest people you’ll go with', { min: 2, max: maxPeople });
    const x = store.put('rides', {
      ...rt, date, time,
      flex: need.int(b.flex ?? 15, 'Flexibility', { min: 0, max: 120 }), vehicle, maxPeople, minPeople,
      girlsOnly: Boolean(b.girlsOnly) && user.gender === 'female',
      fare: b.fare === '' || b.fare == null ? null : need.int(b.fare, 'Estimated fare', { min: 0, max: 20000 }),
      train: String(b.train || '').trim().slice(0, 40),
      createdBy: user.id, requests: [],
      members: [{ uid: user.id, name: user.name, phone: user.phone, gender: user.gender, joinedAt: new Date().toISOString() }],
    });
    system(x, `${user.name} offered this ride.`);
    pub(x); return { ride: view(x, user) };
  });

  r.get('/api/travel/rides/:id', 'student', ({ params, user }) => {
    const x = ride(params.id); if (!visibleTo(x, user)) throw new HttpError(404, 'NOT_FOUND', 'This ride no longer exists.');
    // The group chat is only for people in the ride.
    return { ride: view(x, user), messages: isMember(x, user.id) ? store.list('rideMessages', (m) => m.rideId === x.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-200) : [] };
  });

  // Ask to join: the person who offered the ride decides.
  r.post('/api/travel/rides/:id/request', 'student', async ({ req, params, user }) => {
    const x = ride(params.id); const b = await readJson(req).catch(() => ({}));
    if (!visibleTo(x, user)) throw new HttpError(403, 'GIRLS_ONLY', 'This ride is for girls only.');
    if (isMember(x, user.id)) return { ride: view(x, user) };
    if (x.members.length >= x.maxPeople) throw new HttpError(409, 'FULL', 'This ride just filled up.');
    if (reqOf(x, user.id)) return { ride: view(x, user) };
    const requests = (x.requests || []).filter((q) => q.uid !== user.id);
    requests.push({ uid: user.id, name: user.name, phone: user.phone, gender: user.gender, regNo: user.regNo, note: String(b.note || '').trim().slice(0, 140), at: new Date().toISOString(), status: 'PENDING' });
    const u = store.patch('rides', x.id, { requests });
    pub(u, x.createdBy); return { ride: view(u, user) };
  });
  r.post('/api/travel/rides/:id/request/cancel', 'student', ({ params, user }) => {
    const x = ride(params.id);
    const u = store.patch('rides', x.id, { requests: (x.requests || []).filter((q) => !(q.uid === user.id && q.status === 'PENDING')) });
    pub(u, x.createdBy); return { ride: view(u, user) };
  });
  r.post('/api/travel/rides/:id/requests/:uid', 'student', async ({ req, params, user }) => {
    const x = ride(params.id);
    if (x.createdBy !== user.id) throw new HttpError(403, 'NOT_OWNER', 'Only the person who offered the ride can accept requests.');
    const { accept } = await readJson(req);
    const q = reqOf(x, params.uid); if (!q) throw new HttpError(404, 'NOT_FOUND', 'That request was withdrawn.');
    if (accept && x.members.length >= x.maxPeople) throw new HttpError(409, 'FULL', 'The ride is full. Raise the number of people or decline.');
    const requests = x.requests.map((y) => (y === q ? { ...y, status: accept ? 'ACCEPTED' : 'DECLINED' } : y));
    const members = accept ? [...x.members, { uid: q.uid, name: q.name, phone: q.phone, gender: q.gender, joinedAt: new Date().toISOString() }] : x.members;
    const u = store.patch('rides', x.id, { requests, members });
    if (accept) system(u, `${q.name} joined the ride.`);
    pub(u, q.uid); return { ride: view(u, user) };
  });

  // Rides I'm in or asked to join, and requests waiting for me.
  r.get('/api/travel/mine', 'student', ({ user }) => {
    const all = store.list('rides', (x) => upcoming(x) && (isMember(x, user.id) || (x.requests || []).some((q) => q.uid === user.id)));
    return { rides: all.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map((x) => ({ ...view(x, user), myRequest: (x.requests || []).filter((q) => q.uid === user.id).pop()?.status || null })) };
  });

  r.post('/api/travel/rides/:id/leave', 'student', ({ params, user }) => {
    const x = ride(params.id);
    if (!isMember(x, user.id)) return { ok: true };
    const members = x.members.filter((m) => m.uid !== user.id);
    if (!members.length) { store.remove('rides', x.id); for (const m of store.list('rideMessages', (m) => m.rideId === x.id)) store.remove('rideMessages', m.id); pub(x, ...(x.requests || []).map((q) => q.uid)); return { ok: true, deleted: true }; }
    const createdBy = x.createdBy === user.id ? members[0].uid : x.createdBy;
    const u = store.patch('rides', x.id, { members, createdBy });
    system(u, `${user.name} left the ride.${createdBy !== x.createdBy ? ` ${members[0].name} now handles join requests.` : ''}`);
    pub(u, createdBy); return { ok: true };
  });

  r.post('/api/travel/rides/:id/messages', 'student', async ({ req, params, user }) => {
    const x = ride(params.id);
    if (!isMember(x, user.id)) throw new HttpError(403, 'NOT_MEMBER', 'Only people in this ride can use its group chat.');
    const { text } = await readJson(req);
    const m = store.put('rideMessages', { rideId: x.id, uid: user.id, name: user.name, text: need.str(text, 'Message', { max: 500 }) });
    live.publish(`travel:r:${x.id}`, { id: x.id, message: m.id });
    return { message: m };
  });

  return {
    attention(uid) {
      const out = [];
      for (const x of store.list('rides', (y) => upcoming(y))) {
        const pending = (x.requests || []).filter((q) => q.status === 'PENDING');
        if (x.createdBy === uid && pending.length) out.push({ source: 'travel', tone: 'live', title: `${pending.length === 1 ? `${pending[0].name} wants` : `${pending.length} people want`} to join your ride`, detail: `${x.from} → ${x.to} · ${x.date === today() ? 'Today' : x.date === today(new Date(Date.now() + 86400e3)) ? 'Tomorrow' : x.date}, ${x.time}`, href: 'travel/index.html', at: pending[pending.length - 1].at });
        const myReq = (x.requests || []).filter((q) => q.uid === uid).pop();
        if (isMember(x, uid) && x.date <= today(new Date(Date.now() + 86400e3))) out.push({ source: 'travel', tone: x.members.length >= x.minPeople ? 'ok' : 'warn', title: `Your ride to ${x.to} leaves ${x.date === today() ? 'today' : 'tomorrow'} at ${x.time}`, detail: x.members.length >= x.minPeople ? `${x.members.length} going` : `Needs ${x.minPeople - x.members.length} more to go`, href: 'travel/index.html', at: x.createdAt });
        else if (myReq?.status === 'PENDING') out.push({ source: 'travel', tone: 'live', title: 'Waiting for your ride request', detail: `${x.from} → ${x.to} · ${x.time}`, href: 'travel/index.html', at: myReq.at });
      }
      return out;
    },
    topics(t, { user }) {
      if (t === 'travel:list') return Boolean(user);
      let m;
      if ((m = t.match(/^travel:u:(.+)$/))) return Boolean(user && user.id === m[1]);
      if ((m = t.match(/^travel:r:(.+)$/))) { const x = store.get('rides', m[1]); return Boolean(user && x && isMember(x, user.id)); }
      return false;
    },
  };
}
