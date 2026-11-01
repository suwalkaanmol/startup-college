// First-run data. Runs only when a collection is empty, so it never overwrites real data.
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword, randomPassword } from './lib/password.js';

// Fixed logins for local testing only. In production every password is random (or ADMIN_PASSWORD),
// printed once and written to data/first-run-logins.txt.
export const DEV_LOGINS = [
  { username: 'admin', name: 'UniHub admin', role: 'admin', place: '', password: 'UniHub@Admin1' },
  { username: 'foodys', name: 'Foodys counter', role: 'canteen', place: 'foodys', password: 'Foodys@2026' },
  { username: 'prpkiosk', name: 'PRP Kiosk counter', role: 'canteen', place: 'prp-kiosk', password: 'PrpKiosk@2026' },
  { username: 'prp', name: 'PRP Xerox', role: 'xerox', place: 'prp', password: 'PrpXerox@2026' },
  { username: 'tt', name: 'TT Xerox', role: 'xerox', place: 'tt', password: 'TtXerox@2026' },
  { username: 'ganga', name: 'Ganga Xerox', role: 'xerox', place: 'ganga', password: 'GangaXerox@2026' },
  { username: 'little', name: 'Little Shop Xerox', role: 'xerox', place: 'little', password: 'Little@2026' },
  { username: 'hblock', name: 'H Block Xerox', role: 'xerox', place: 'h-block', password: 'HBlock@2026' },
  { username: 'jblock', name: 'J Block Xerox', role: 'xerox', place: 'j-block', password: 'JBlock@2026' },
];

const RATES = { bwSingle: 2, bwDouble: 3, colorSingle: 10, colorDouble: 20, spiral: 30 }; // from the Xerox team's pricing
const SHOPS = [
  ['prp', 'PRP Xerox', 'main', 'P'], ['tt', 'TT Xerox', 'main', 'T'], ['ganga', 'Ganga Xerox', 'main', 'G'],
  ['little', 'Little Shop Xerox', 'main', 'L'], ['h-block', 'H Block', 'hostel', 'H'], ['j-block', 'J Block', 'hostel', 'J'],
];

const MENUS = {
  foodys: [
    ['Masala Dosa', 'Breakfast', 60, true, 8], ['Idli (2) with sambar', 'Breakfast', 35, true, 5], ['Poori masala', 'Breakfast', 50, true, 8],
    ['Veg fried rice', 'Meals', 90, true, 12], ['Paneer butter masala + 2 rotis', 'Meals', 120, true, 15], ['Chicken biryani', 'Meals', 150, false, 15], ['Egg fried rice', 'Meals', 100, false, 12],
    ['Veg puff', 'Snacks', 25, true, 3], ['Samosa (2)', 'Snacks', 30, true, 3],
    ['Filter coffee', 'Drinks', 20, true, 3], ['Masala chai', 'Drinks', 15, true, 3], ['Fresh lime soda', 'Drinks', 40, true, 4],
  ],
  'prp-kiosk': [
    ['Veg sandwich', 'Snacks', 50, true, 6], ['Grilled cheese sandwich', 'Snacks', 70, true, 8], ['Masala Maggi', 'Snacks', 45, true, 7], ['Egg puff', 'Snacks', 30, false, 3], ['Chocolate brownie', 'Snacks', 50, true, 2],
    ['Cold coffee', 'Drinks', 60, true, 4], ['Tea', 'Drinks', 15, true, 3], ['Lassi', 'Drinks', 45, true, 4],
  ],
};

const PG_SAMPLES = [
  { name: 'Sample PG: Green Nest', area: 'Near VIT Main Gate', distanceKm: 0.8, rent: 9000, gender: 'male', sharing: 2, food: true, amenities: ['Wi-Fi', 'AC', 'Mess', 'Laundry'] },
  { name: 'Sample PG: Lotus Residency', area: 'Gandhi Nagar, Katpadi', distanceKm: 2.5, rent: 7500, gender: 'female', sharing: 3, food: true, amenities: ['Wi-Fi', 'Mess', 'CCTV', 'Warden'] },
  { name: 'Sample PG: Riverside Rooms', area: 'Katpadi Junction', distanceKm: 4.1, rent: 11000, gender: 'any', sharing: 1, food: false, amenities: ['Wi-Fi', 'AC', 'Attached bath'] },
];

export function seed(store, cfg, log = console.log) {
  if (!store.count('canteens')) {
    store.put('canteens', { id: 'foodys', name: 'Foodys', place: 'Food court', prefix: 'F', open: true, sampleMenu: true });
    store.put('canteens', { id: 'prp-kiosk', name: 'PRP Kiosk', place: 'Pearl Research Park, ground floor', prefix: 'K', open: true, sampleMenu: true });
    for (const [cid, items] of Object.entries(MENUS)) {
      for (const [name, category, price, veg, prepMins] of items) store.put('menu', { canteenId: cid, name, category, price, veg, prepMins, inStock: true });
    }
  }
  if (!store.count('shops')) {
    for (const [id, name, grp, prefix] of SHOPS) store.put('shops', { id, name, grp, prefix, open: true, rates: { ...RATES } });
  }
  if (!store.count('pgListings')) {
    for (const l of PG_SAMPLES) store.put('pgListings', { ...l, sample: true, contactName: 'Sample contact', contactPhone: '' });
  }
  if (!store.count('staff')) {
    const lines = [];
    for (const d of DEV_LOGINS) {
      let password = d.password;
      if (cfg.production) password = d.role === 'admin' && cfg.adminPassword ? cfg.adminPassword : randomPassword();
      store.put('staff', { username: d.username, name: d.name, role: d.role, place: d.place, hash: hashPassword(password) });
      lines.push(`${d.role.padEnd(8)} ${d.username.padEnd(10)} ${d.role === 'admin' && cfg.production && cfg.adminPassword ? '(ADMIN_PASSWORD)' : password}`);
    }
    if (cfg.production) {
      const out = path.join(store.dir, 'first-run-logins.txt');
      fs.writeFileSync(out, 'UniHub staff logins created on first run. Change them in the admin page, then delete this file.\n\n' + lines.join('\n') + '\n', { mode: 0o600 });
      log(`Staff logins created. They are in ${out}`);
    } else {
      log('Staff logins for local testing (see SETUP.md):\n  ' + lines.join('\n  '));
    }
  }
}
