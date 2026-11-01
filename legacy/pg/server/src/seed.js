// Idempotent seed: 25 office hubs and 6 clearly-labelled sample PGs per hub.
// PGs come from a deterministic PRNG so every run produces identical data.
import { pool } from './db.js';

// [id, city, area, lat, lng, base double-sharing rent (INR)]
const HUBS = [
  ['blr-whitefield', 'Bengaluru', 'Whitefield (ITPL)', 12.9856, 77.7352, 9500],
  ['blr-bellandur', 'Bengaluru', 'Bellandur / ORR', 12.9259, 77.6762, 10500],
  ['blr-ecity', 'Bengaluru', 'Electronic City', 12.8452, 77.6602, 7500],
  ['blr-manyata', 'Bengaluru', 'Manyata Tech Park', 13.0475, 77.6208, 8500],
  ['blr-koramangala', 'Bengaluru', 'Koramangala', 12.9352, 77.6245, 11000],
  ['blr-bagmane', 'Bengaluru', 'Bagmane / CV Raman Nagar', 12.9784, 77.6648, 9500],
  ['hyd-hitec', 'Hyderabad', 'HITEC City', 17.4435, 78.3772, 8500],
  ['hyd-gachibowli', 'Hyderabad', 'Gachibowli', 17.4401, 78.3489, 8500],
  ['hyd-fd', 'Hyderabad', 'Financial District', 17.4156, 78.3406, 8000],
  ['maa-omr', 'Chennai', 'OMR Sholinganallur', 12.9010, 80.2279, 7500],
  ['maa-perungudi', 'Chennai', 'Perungudi / Taramani', 12.9654, 80.2461, 8000],
  ['maa-guindy', 'Chennai', 'Guindy', 13.0067, 80.2206, 8000],
  ['maa-siruseri', 'Chennai', 'Siruseri SIPCOT', 12.8231, 80.2207, 6500],
  ['pnq-hinjewadi', 'Pune', 'Hinjewadi', 18.5912, 73.7389, 7500],
  ['pnq-kharadi', 'Pune', 'Kharadi', 18.5513, 73.9410, 8000],
  ['pnq-magarpatta', 'Pune', 'Magarpatta', 18.5158, 73.9272, 8000],
  ['bom-powai', 'Mumbai', 'Powai', 19.1176, 72.9060, 13000],
  ['bom-bkc', 'Mumbai', 'BKC', 19.0674, 72.8697, 15000],
  ['del-gurugram', 'Delhi NCR', 'Gurugram Cyber City', 28.4950, 77.0890, 10000],
  ['del-noida62', 'Delhi NCR', 'Noida Sector 62', 28.6270, 77.3649, 7500],
  ['ccu-saltlake', 'Kolkata', 'Salt Lake Sector V', 22.5726, 88.4339, 6500],
  ['cok-infopark', 'Kochi', 'Infopark', 10.0094, 76.3650, 6500],
  ['trv-technopark', 'Trivandrum', 'Technopark', 8.5574, 76.8813, 6000],
  ['cbe-tidel', 'Coimbatore', 'Tidel Park', 11.0230, 77.0270, 5500],
  ['mys-hebbal', 'Mysuru', 'Hebbal Industrial Area', 12.3560, 76.6240, 5000],
];

const NAMES = ['Lotus', 'Sunrise', 'Green Leaf', 'Blue Orchid', 'Maple', 'Royal', 'Urban', 'Cozy Corner',
  'Harmony', 'Pearl', 'Skyline', 'Evergreen', 'Sapphire', 'Comfort', 'Metro', 'Campus Edge'];
const SUFFIXES = ['Residency', 'Nest', 'Stay', 'Homes', 'Villa', 'Suites', 'Towers', 'Retreat', 'Heights', 'House'];
const RULES = ['No smoking inside', 'No alcohol on premises', 'Visitors in common area only', 'Quiet hours after 10 PM',
  'ID proof required', 'No cooking in rooms', 'Monthly rent due by the 5th'];
const AMENITIES = ['Wi-Fi', 'Power backup', 'Laundry', 'AC rooms', 'Hot water', 'Housekeeping', 'CCTV', 'Parking',
  'Refrigerator', 'Study table', 'Gym access', 'Lift'];

// mulberry32: tiny deterministic PRNG.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rand, arr, n) => {
  const pool = [...arr];
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
};
const round500 = (n) => Math.round(n / 500) * 500;
const GATES = [null, null, '22:00', '22:30', '23:00', '23:30'];
const FOODS = ['none', 'veg', 'veg_nonveg'];

export async function seed() {
  const rand = prng(20261028);
  let counter = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [id, city, area, lat, lng, base] of HUBS) {
      await client.query(
        `INSERT INTO hubs (id, city, area, lat, lng) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE SET city=$2, area=$3, lat=$4, lng=$5`, [id, city, area, lat, lng]);
      for (let i = 0; i < 6; i++) {
        const gender = i % 2 === 0 ? 'male' : 'female';
        const idx = counter++; // unique name per PG: 16 names x 10 suffixes = 160 combos
        const name = `${NAMES[idx % 16]} ${SUFFIXES[Math.floor(idx / 16) % 10]} ${gender === 'male' ? "Men's" : "Women's"} PG`;
        // Random point within ~6 km of the hub.
        const r = Math.sqrt(rand()) * 6, th = rand() * 2 * Math.PI;
        const pLat = lat + (r * Math.cos(th)) / 111;
        const pLng = lng + (r * Math.sin(th)) / (111 * Math.cos((lat * Math.PI) / 180));
        const dbl = round500(base * (0.85 + rand() * 0.35));
        const single = round500(dbl * 1.45), triple = round500(dbl * 0.8);
        const gate = GATES[Math.floor(rand() * GATES.length)];
        await client.query(
          `INSERT INTO pgs (id,name,hub_id,locality,lat,lng,gender,rent_single,rent_double,rent_triple,
             deposit_months,food,gate_closes,rules,amenities,beds_total,is_sample)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true)
           ON CONFLICT (id) DO UPDATE SET name=$2, hub_id=$3, locality=$4, lat=$5, lng=$6, gender=$7,
             rent_single=$8, rent_double=$9, rent_triple=$10, deposit_months=$11, food=$12, gate_closes=$13,
             rules=$14, amenities=$15, beds_total=$16, is_sample=true`,
          [`${id}-${i + 1}`, name, id, area, pLat, pLng, gender, single, dbl, triple,
            1 + Math.floor(rand() * 2), FOODS[Math.floor(rand() * 3)], gate,
            pick(rand, RULES, 3 + Math.floor(rand() * 2)), pick(rand, AMENITIES, 5 + Math.floor(rand() * 3)),
            12 + Math.floor(rand() * 25)]);
      }
    }
    await client.query('COMMIT');
    console.log(`[seed] ${HUBS.length} hubs, ${HUBS.length * 6} sample PGs`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
