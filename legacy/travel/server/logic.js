const { randomInt } = require("crypto");
const GIRLS = "ABCDEFGHJS".split(""), BOYS = "ABCDEGHJKLMNPQRT".split("");
const BLOCKS = [...GIRLS.map(b => `Girls ${b}`), ...BOYS.map(b => `Boys ${b}`)];
const SOURCES = ["Main Gate", "RJT", ...BLOCKS];
const DESTS = { "Katpadi Railway Station": 7, "New Vellore Bus Stand": 5, "Chittoor Bus Stand": 40, "Old Bus Stand": 12, "Chennai Airport": 135, "Bangalore Airport": 210 }; // approx km from main gate
const PROVIDERS = { "Maya Call Taxi": 1.0, "Red Taxi": 1.05, Ola: 1.1, Uber: 1.15, Rapido: 0.95 };
const MAX_DAYS_AHEAD = 30, EXPIRE_AFTER_H = 12;
const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const istNow = (d = new Date()) => new Date(d.getTime() + 330 * 60000).toISOString(); // "YYYY-MM-DDTHH:mm..." in IST
const travelAt = (date, time) => new Date(`${date}T${time}:00+05:30`);
const isBlock = s => s.startsWith("Girls ") || s.startsWith("Boys ");

function validatePlan(p, gender, now = new Date()) {
  const err = m => ({ error: m });
  if (!Array.isArray(p.sources) || p.sources.length < 1 || p.sources.length > 2 || new Set(p.sources).size !== p.sources.length) return err("Choose Main Gate or a hostel block");
  if (p.sources.some(s => !SOURCES.includes(s))) return err("Unknown pickup point");
  if (p.sources.filter(isBlock).length > 1) return err("Select only one hostel block");
  if (p.sources.filter(s => s === "RJT").length && p.sources.length === 2 && p.sources.some(isBlock)) return err("Pick RJT alone or with Main Gate");
  for (const s of p.sources.filter(isBlock)) if (s.startsWith(gender === "female" ? "Boys" : "Girls")) return err("Choose a hostel block of your own hostel");
  if (!["from", "to"].includes(p.dir || "from")) return err("Invalid direction");
  if (!(p.dest in DESTS)) return err("Unknown destination");
  if (!["Cab", "Auto", "Any"].includes(p.vehicle)) return err("Invalid vehicle");
  if (![0, 3, 4].includes(p.size)) return err("Group size must be 3, 4 or any");
  if (p.girlsOnly && gender !== "female") return err("Girls-only groups are for female users");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || "") || !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.time || "") || !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.timeTo || "")) return err("Pick a date, earliest and latest departure");
  const flex = toMin(p.timeTo) - toMin(p.time);
  if (flex < 0) return err("Latest departure can't be before earliest departure");
  const first = travelAt(p.date, p.time), last = travelAt(p.date, p.timeTo);
  if (isNaN(first)) return err("Invalid date");
  if (last < now) return err("That departure window is already over");
  if (first > new Date(now.getTime() + MAX_DAYS_AHEAD * 864e5)) return err(`You can plan at most ${MAX_DAYS_AHEAD} days ahead`);
  if (p.train && !/^\d{5}$/.test(String(p.train).trim())) return err("Train number must be 5 digits");
  return { ok: true, flex, train: (p.train || "").trim() };
}
const vehicleOk = (a, b) => a === "Any" || b === "Any" || a === b;
const resolveVehicle = (a, b) => (a === "Any" ? b : a);
const norm = s => (s || "").toLowerCase().replace(/\s+/g, "");
const sameTrain = (a, b) => !!norm(a) && norm(a) === norm(b);

// can `plan` (a user's wish) join `g` (group-like: date,dest,vehicle,sources,girlsOnly,time,flex)?
function compatible(g, plan, gender) { // pickup points never matter: everything on campus is close enough to share
  if (g.date !== plan.date || g.dest !== plan.dest || (g.dir || "from") !== (plan.dir || "from")) return false;
  if (!vehicleOk(g.vehicle, plan.vehicle)) return false;
  if (g.girlsOnly && gender !== "female") return false;
  if (plan.girlsOnly && !g.girlsOnly) return false;
  if (plan.size && g.rawSize && plan.size !== g.rawSize) return false;
  const a = toMin(g.time), b = toMin(plan.time); // windows [earliest, latest] must overlap (containment counts)
  return a <= b + (plan.flex || 0) && b <= a + (g.flex || 0);
}
const win = ms => ({ s: Math.max(...ms.map(m => toMin(m.time))), e: Math.min(...ms.map(m => toMin(m.time) + m.flex)) }); // common window of members
const rank = (groups, plan) => groups.map(g => ({ g, top: g.members.some(m => sameTrain(m.train, plan.train)) }))
  .sort((x, y) => y.top - x.top || toMin(x.g.time) - toMin(y.g.time)).map(x => ({ ...x.g, trainMatch: x.top }));

function genCode(used) {
  if (used.size >= 676) throw new Error("No group codes left");
  for (;;) { const c = String.fromCharCode(65 + randomInt(26)) + (1 + randomInt(26)); if (!used.has(c)) return c; }
}
const LOCAL = new Set(["Katpadi Railway Station", "New Vellore Bus Stand", "Old Bus Stand"]);
const fare = (dest, p, pickup) => (p === "Maya Call Taxi" && LOCAL.has(dest) ? (pickup === "Main Gate" ? 250 : 300) : Math.round((60 + 17 * DESTS[dest]) * PROVIDERS[p] / 10) * 10);
const fares = (dest, pickup) => Object.keys(PROVIDERS).map(name => ({ name, price: fare(dest, name, pickup), km: DESTS[dest] }));
const addMin = (t, m) => { const x = toMin(t) + m; return String(Math.floor(x / 60) % 24).padStart(2, "0") + ":" + String(x % 60).padStart(2, "0"); };
const expiry = (date, time) => new Date(travelAt(date, time).getTime() + EXPIRE_AFTER_H * 36e5);
const pickupFor = ms => { const n = {}; for (const m of ms) for (const x of new Set(m.sources || [])) n[x] = (n[x] || 0) + 1; const top = Math.max(0, ...Object.values(n)); const best = Object.keys(n).filter(x => n[x] === top); return best.includes("Main Gate") || !best.length ? "Main Gate" : best[0]; }; // point most people accept; Main Gate wins ties
module.exports = { win, pickupFor, addMin, SOURCES, GIRLS, BOYS, DESTS, PROVIDERS, validatePlan, compatible, rank, genCode, fares, expiry, vehicleOk, resolveVehicle, sameTrain, toMin };
