// First-run data, and upgrades of older data. Never overwrites real orders or menus a canteen has edited.
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword, randomPassword } from './lib/password.js';

// Fixed logins for local testing only. In production every password is random (or ADMIN_PASSWORD),
// printed once and written to data/first-run-logins.txt. Each canteen and each Xerox shop has its own owner login.
export const DEV_LOGINS = [
  { username: 'admin', name: 'UniHub admin', role: 'admin', place: '', password: 'UniHub@Admin1' },
  { username: 'kc', name: 'KC owner', role: 'canteen', place: 'kc', password: 'KcFood@2026' },
  { username: 'darling', name: 'Darling (DC) owner', role: 'canteen', place: 'darling', password: 'Darling@2026' },
  { username: 'hangyswig', name: 'Hangy & Swig owner', role: 'canteen', place: 'hangy-swig', password: 'HangySwig@2026' },
  { username: 'garnish', name: 'Garnish owner', role: 'canteen', place: 'garnish', password: 'Garnish@2026' },
  { username: 'prp', name: 'PRP Xerox owner', role: 'xerox', place: 'prp', password: 'PrpXerox@2026' },
  { username: 'tt', name: 'TT Xerox owner', role: 'xerox', place: 'tt', password: 'TtXerox@2026' },
  { username: 'ganga', name: 'Ganga Xerox owner', role: 'xerox', place: 'ganga', password: 'GangaXerox@2026' },
  { username: 'little', name: 'Little Shop Xerox owner', role: 'xerox', place: 'little', password: 'Little@2026' },
  { username: 'hblock', name: 'H Block Xerox owner', role: 'xerox', place: 'h-block', password: 'HBlock@2026' },
  { username: 'jblock', name: 'J Block Xerox owner', role: 'xerox', place: 'j-block', password: 'JBlock@2026' },
];

// Prices per sheet (₹). A4 from the Xerox team's pricing; A3 is double; spiral and staple per bound copy.
export const RATES = { bwSingle: 2, bwDouble: 3, colorSingle: 10, colorDouble: 20, a3BwSingle: 4, a3BwDouble: 6, a3ColorSingle: 20, a3ColorDouble: 40, spiral: 30, staple: 2 };
const SHOPS = [
  ['prp', 'PRP Xerox', 'main', 'P', {}], ['tt', 'TT Xerox', 'main', 'T', { colorSingle: 12 }], ['ganga', 'Ganga Xerox', 'main', 'G', {}],
  ['little', 'Little Shop Xerox', 'main', 'L', {}], ['h-block', 'H Block', 'hostel', 'H', {}], ['j-block', 'J Block', 'hostel', 'J', {}],
];

export const CANTEENS = [
  { id: 'kc', name: 'KC', place: 'Between SJT and PRP', prefix: 'K' },
  { id: 'darling', name: 'Darling (DC)', place: 'Darling Food Court, near TT', prefix: 'D' },
  { id: 'hangy-swig', name: 'Hangy & Swig', place: 'Between SJT and PRP', prefix: 'H' },
  { id: 'garnish', name: 'Garnish', place: 'Street food, Indo-Chinese, noodles & rice', prefix: 'G' },
];

// The four canteens' menus as the Food team entered them: [name, category, price, veg].
const MENUS = {
  'garnish': [
    ["Chilli Chicken", "Starters", 140, false],
    ["Chicken Manchurian", "Starters", 140, false],
    ["Gobi Manchurian", "Starters", 140, true],
    ["Chilli Gobi", "Starters", 140, true],
    ["Paneer Manchurian", "Starters", 140, true],
    ["Chilli Paneer", "Starters", 140, true],
    ["Egg Roll", "Rolls", 110, false],
    ["Chicken Roll", "Rolls", 110, false],
    ["Paneer Roll", "Rolls", 110, true],
    ["Gobi Roll", "Rolls", 110, true],
    ["Wai Wai (Plain)", "Snacks", 60, true],
    ["Vegetable Wai Wai", "Snacks", 60, true],
    ["Chicken Wai Wai", "Snacks", 70, false],
    ["Maggi", "Snacks", 30, true],
    ["Vegetable Maggi", "Snacks", 30, true],
    ["Egg Maggi", "Snacks", 50, false],
    ["Chicken Maggi", "Snacks", 60, false],
    ["Veg Noodles", "Noodles", 100, true],
    ["Egg Noodles", "Noodles", 110, false],
    ["Chicken Noodles", "Noodles", 120, false],
    ["Egg Chicken Noodles", "Noodles", 120, false],
    ["Mix Non-Veg Noodles", "Noodles", 150, false],
    ["Veg Fried Rice", "Rice", 100, true],
    ["Egg Fried Rice", "Rice", 110, false],
    ["Gobi Fried Rice", "Rice", 100, true],
    ["Paneer Fried Rice", "Rice", 140, true],
    ["Chicken Fried Rice", "Rice", 120, false],
    ["Prawn Fried Rice", "Rice", 150, false],
  ],
  'hangy-swig': [
    ["Veg Gobi Chinese Combo", "Combos", 170, true],
    ["Veg Paneer Chinese Combo", "Combos", 200, true],
    ["Non-Veg Chinese Combo", "Combos", 200, false],
    ["Veg Burger Combo", "Combos", 200, true],
    ["Non-Veg Burger Combo", "Combos", 220, false],
    ["Classic Mac & Cheese", "Mac & Cheese", 200, true],
    ["Makhani Mac & Cheese", "Mac & Cheese", 220, true],
    ["French Fries", "Snacks", 90, true],
    ["Potato Wedges", "Snacks", 90, true],
    ["Honey Chilli Potato", "Snacks", 150, true],
    ["Plain Maggi", "Maggi", 45, true],
    ["Veg Maggi", "Maggi", 50, true],
    ["Egg Maggi", "Maggi", 80, false],
    ["Chicken Maggi", "Maggi", 85, false],
    ["Veg Rice / Noodles", "Main Course", 90, true],
    ["Egg Rice / Noodles", "Main Course", 100, false],
    ["Chicken Rice / Noodles", "Main Course", 120, false],
    ["Garden Salad Cheese Burger", "Burger", 65, true],
    ["Crispy Chicken Burger", "Burger", 120, false],
    ["Aloo Masala Roll", "Rolls", 60, true],
    ["Chicken Roll", "Rolls", 120, false],
    ["Grilled Veg Sandwich", "Sandwich", 60, true],
    ["Chicken Tikka Sandwich", "Sandwich", 110, false],
    ["Classic Double Egg Omelette", "Omelette", 50, false],
  ],
  'darling': [
    ["Vadai", "Breakfast", 18, true],
    ["Idly (2 Nos)", "Breakfast", 20, true],
    ["Pongal", "Breakfast", 40, true],
    ["Poori Masala", "Breakfast", 40, true],
    ["Rava Dosai", "Dosai", 46, true],
    ["Plain Dosai", "Dosai", 40, true],
    ["Masala Dosai", "Dosai", 48, true],
    ["Onion Dosai", "Dosai", 52, true],
    ["Egg Dosai", "Dosai", 52, false],
    ["Ghee Dosai", "Dosai", 92, true],
    ["Chicken Cheese Dosai", "Dosai", 110, false],
    ["Chapati", "Breads", 42, true],
    ["Parotta", "Breads", 48, true],
    ["Kothu Parotta Veg", "Breads", 81, true],
    ["Kothu Parotta Chicken", "Breads", 104, false],
    ["Plain Omelette", "Omelette", 46, false],
    ["Variety Rice", "Rice", 48, true],
    ["Curd Rice", "Rice", 48, true],
    ["Veg Biryani", "Rice", 48, true],
    ["Egg Biryani", "Rice", 105, false],
    ["Chicken Biryani", "Rice", 135, false],
    ["Chicken Pulav", "Rice", 140, false],
    ["Gobi 65", "Starters", 63, true],
    ["Paneer 65", "Starters", 85, true],
    ["Chicken 65", "Starters", 125, false],
    ["Chicken Tikka", "Starters", 120, false],
    ["Veg Fried Rice", "Chinese", 70, true],
    ["Veg Noodles", "Chinese", 70, true],
    ["Egg Fried Rice", "Chinese", 80, false],
    ["Chicken Fried Rice", "Chinese", 105, false],
    ["Chicken Noodles", "Chinese", 105, false],
    ["Gobi Manchurian", "Chinese", 98, true],
    ["Chilly Chicken", "Chinese", 115, false],
    ["Dhal Fry", "North Indian", 66, true],
    ["Paneer Butter Masala", "North Indian", 91, true],
    ["Butter Chicken Masala", "North Indian", 125, false],
    ["Veg Pasta", "Pasta", 100, true],
    ["Simple Veg Pizza", "Pizza", 130, true],
    ["Chicken Pizza", "Pizza", 165, false],
    ["Veg Sandwich", "Sandwich", 40, true],
    ["French Fries", "Snacks", 71, true],
    ["Veg Burger", "Snacks", 81, true],
    ["Chicken Burger", "Snacks", 109, false],
    ["Pav Bhaji", "Snacks", 69, true],
    ["Vanilla Ice Cream", "Dessert", 58, true],
    ["Cold Coffee", "Beverages", 58, true],
    ["Fresh Lemon", "Beverages", 30, true],
    ["Lassi", "Beverages", 52, true],
  ],
  'kc': [
    ["Cheese Pav Bhaji", "Cheese Items", 85, true],
    ["Cheese Vada Pav", "Cheese Items", 70, true],
    ["Cheese Dabeli", "Cheese Items", 70, true],
    ["Green Cheese Dabeli", "Cheese Items", 70, true],
    ["Cheese Paneer Masala Pav", "Cheese Items", 100, true],
    ["Cheese Masala Papad", "Cheese Items", 80, true],
    ["Cheese Papdi Chat", "Cheese Items", 80, true],
    ["Spl Aloo Tikki Cheese Pav", "Cheese Items", 70, true],
    ["Potato Cheese Ball", "Cheese Items", 120, true],
    ["Paneer Cheese Ball", "Cheese Items", 140, true],
    ["Paneer Manchurian", "Paneer Items", 120, true],
    ["Paneer 65", "Paneer Items", 110, true],
    ["Paneer Pav Bhaji", "Paneer Items", 85, true],
    ["Paneer Masala Pav", "Paneer Items", 90, true],
    ["Paneer Kurkure", "Paneer Items", 110, true],
    ["Paneer Finger", "Paneer Items", 110, true],
    ["Paneer Sandwich", "Sandwich", 90, true],
    ["Mushroom Sandwich", "Sandwich", 80, true],
    ["Mix Veg Sandwich", "Sandwich", 70, true],
    ["Sweet Corn Sandwich", "Sandwich", 60, true],
    ["Aloo Sandwich", "Sandwich", 60, true],
    ["Veg Sandwich", "Sandwich", 50, true],
    ["Khakhra Sandwich", "Sandwich", 90, true],
    ["Club Sandwich", "Sandwich", 120, true],
    ["Cheese Sandwich", "Sandwich", 90, true],
    ["Garlic Cheese Sandwich", "Sandwich", 120, true],
    ["Extra Cheese", "Sandwich", 20, true],
  ],
};

// Minutes to prepare, from the Food team's rule (dosa 20, rice and noodles 30, the rest 15), with quick items faster.
export function prepFor(name, category) {
  const n = name.toLowerCase(), c = category.toLowerCase();
  if (/beverage|dessert|lassi|juice|shake|ice cream/.test(c) || /lemon|coffee|lassi|ice cream|extra cheese/.test(n)) return 5;
  if (/maggi|wai wai|sandwich|roll|omelette|burger/.test(n)) return 10;
  if (/dosa/.test(n)) return 20;
  if (/rice|biryani|noodles|pulav|combo/.test(n)) return 30;
  return 15;
}

// Example PGs near office areas (PG Mate is for after placements). Marked as samples for the admin to replace.
const PG_SAMPLES = [
  { name: 'Sample PG: Green Nest', city: 'Bengaluru', area: 'Whitefield (ITPL)', distanceKm: 1.2, rent: 9500, gender: 'male', sharing: 2, food: true, amenities: ['Wi-Fi', 'AC', 'Food', 'Laundry'] },
  { name: 'Sample PG: Lotus Residency', city: 'Hyderabad', area: 'Gachibowli', distanceKm: 1.5, rent: 8500, gender: 'female', sharing: 2, food: true, amenities: ['Wi-Fi', 'Food', 'CCTV', 'Housekeeping'] },
  { name: 'Sample PG: Harbour Stay', city: 'Chennai', area: 'OMR Sholinganallur', distanceKm: 0.8, rent: 7500, gender: 'any', sharing: 3, food: false, amenities: ['Wi-Fi', 'AC', 'Attached bath'] },
];

const SEED_VERSION = 3;

export function seed(store, places, cfg, log = console.log) {
  if (cfg.production && !cfg.adminPassword && !store.list('staff', (x) => x.role === 'admin').length) throw new Error('Set ADMIN_PASSWORD (8+ characters, letters and numbers) before the first start in production.');
  const meta = store.get('meta', 'seed');
  if ((meta?.v || 1) < 2 && store.count('canteens')) upgradeFromV1(store);
  // Version 3: PG Mate is about office cities, so the old near-campus sample PGs are replaced.
  if ((meta?.v || 1) < 3) for (const l of store.list('pgListings', (x) => x.sample && !x.city)) store.remove('pgListings', l.id);

  for (const c of CANTEENS) {
    if (store.get('canteens', c.id)) continue;
    store.put('canteens', { ...c, open: true, upi: '' });
    const db = places.get('food', c.id);
    if (!db.count('menu')) for (const [name, category, price, veg] of MENUS[c.id] || []) db.put('menu', { name, category, price, veg, prepMins: prepFor(name, category), available: true, dailyQty: null, qtyLeft: null, qtyDay: '' });
  }
  for (const [id, name, grp, prefix, over] of SHOPS) {
    if (!store.get('shops', id)) store.put('shops', { id, name, grp, prefix, open: true, upi: '', rates: { ...RATES, ...over } });
  }
  for (const s of store.list('shops')) if (s.rates && s.rates.staple === undefined) store.patch('shops', s.id, { rates: { ...RATES, ...s.rates } });
  if (!store.count('pgListings')) {
    for (const l of PG_SAMPLES) store.put('pgListings', { ...l, sample: true, contactName: 'Sample contact', contactPhone: '' });
  }

  const lines = [];
  for (const d of DEV_LOGINS) {
    if (store.list('staff', (x) => x.username === d.username).length) continue;
    if (d.role !== 'admin' && !store.get(d.role === 'canteen' ? 'canteens' : 'shops', d.place)) continue;
    let password = d.password;
    if (cfg.production) password = d.role === 'admin' && cfg.adminPassword ? cfg.adminPassword : randomPassword();
    store.put('staff', { username: d.username, name: d.name, role: d.role, place: d.place, hash: hashPassword(password) });
    lines.push(`${d.role.padEnd(8)} ${d.username.padEnd(10)} ${d.role === 'admin' && cfg.production && cfg.adminPassword ? '(ADMIN_PASSWORD)' : password}`);
  }
  if (lines.length) {
    if (cfg.production) {
      // On a server with a disk, also keep them in a private file (not possible on hosts without one; the admin can reset them).
      try { fs.mkdirSync(store.dir, { recursive: true }); fs.appendFileSync(path.join(store.dir, 'first-run-logins.txt'), 'UniHub owner logins created on first run. Change them in the admin page, then delete this file.\n\n' + lines.join('\n') + '\n', { mode: 0o600 }); } catch { /* no writable disk */ }
      log('Owner logins created with random passwords. Sign in at /admin/ (staff ID admin, your ADMIN_PASSWORD) and use “Reset password” on each canteen and shop login to get its password.');
    } else {
      log('Owner logins for local testing (see SETUP.md):\n  ' + lines.join('\n  '));
    }
  }
  if (store.get('meta', 'seed')?.v !== SEED_VERSION) store.put('meta', { id: 'seed', v: SEED_VERSION });
}

// Version 1 had two sample canteens and kept every order in one shared file. Remove the samples and
// the shared order data (demo data only), so each canteen and shop starts with its own database.
function upgradeFromV1(store) {
  for (const id of ['foodys', 'prp-kiosk']) store.remove('canteens', id);
  for (const s of store.list('staff', (x) => x.role === 'canteen' && ['foodys', 'prp-kiosk'].includes(x.place))) store.remove('staff', s.id);
  for (const col of ['menu', 'foodOrders', 'xeroxOrders', 'xeroxFiles']) for (const d of store.list(col)) store.remove(col, d.id);
}
