const t = require("node:test"), a = require("node:assert/strict"), L = require("../logic");
const soon = new Date(Date.now() + 864e5 * 2).toISOString().slice(0, 10);
const base = { dir: "from", sources: ["Main Gate", "Boys C"], dest: "Chennai Airport", vehicle: "Cab", size: 4, date: soon, time: "10:00", timeTo: "10:30" };
t("valid plan", () => a.ok(L.validatePlan(base, "male").ok));
t("two hostel blocks rejected", () => a.ok(L.validatePlan({ ...base, sources: ["Boys A", "Boys B"] }, "male").error));
t("boys cannot pick girls block", () => a.ok(L.validatePlan({ ...base, sources: ["Girls A"] }, "male").error));
t("girls-only needs female", () => a.ok(L.validatePlan({ ...base, girlsOnly: true }, "male").error));
t("girl can create girls-only", () => a.ok(L.validatePlan({ ...base, sources: ["Girls J"], girlsOnly: true }, "female").ok));
t("past + >30 days rejected", () => { a.ok(L.validatePlan({ ...base, date: "2020-01-01" }, "male").error); a.ok(L.validatePlan({ ...base, date: "2099-01-01" }, "male").error); });
t("latest before earliest rejected; missing latest rejected", () => { a.ok(L.validatePlan({ ...base, timeTo: "09:00" }, "male").error); a.ok(L.validatePlan({ ...base, timeTo: undefined }, "male").error); a.equal(L.validatePlan(base, "male").flex, 30); });
t("vehicle rules", () => { a.ok(L.vehicleOk("Cab", "Any")); a.ok(L.vehicleOk("Auto", "Any")); a.equal(L.vehicleOk("Cab", "Auto"), false); });
t("compat: pickup never matters, direction/dest/date do, windows may nest", () => {
  const g = { ...base, dir: "from", flex: 30, members: [] }; // 10:00–10:30
  a.ok(L.compatible(g, { ...base, sources: ["Boys D"], time: "10:30", timeTo: "11:00", flex: 30 }, "male")); // other hostel + touching window
  a.equal(L.compatible(g, { ...base, dir: "to" }, "male"), false);
  a.equal(L.compatible(g, { ...base, time: "13:00", timeTo: "13:30", flex: 30 }, "male"), false);
  a.equal(L.compatible({ ...g, girlsOnly: true }, base, "male"), false);
  const wide = { ...g, time: "14:00", flex: 60 }; // someone going 2pm–3pm
  a.ok(L.compatible(wide, { ...base, time: "14:30", flex: 15 }, "male")); // sees a 2:30–2:45 traveller…
  a.ok(L.compatible({ ...g, time: "14:30", flex: 15 }, { ...base, time: "14:00", flex: 60 }, "male")); // …and they see the 2–3pm traveller
});
t("size: equal or 'any' matches", () => { const g = { ...base, rawSize: 3, flex: 30 }; a.equal(L.compatible(g, { ...base, size: 4, flex: 30 }, "male"), false); a.ok(L.compatible(g, { ...base, size: 0, flex: 30 }, "male")); });
t("common window = overlap of members", () => a.deepEqual(L.win([{ time: "14:00", flex: 60 }, { time: "14:30", flex: 15 }]), { s: 870, e: 885 }));
t("maya: 250 from main gate, 300 otherwise (local trips)", () => { const m = p => L.fares("Katpadi Railway Station", p).find(f => f.name === "Maya Call Taxi").price; a.equal(m("Main Gate"), 250); a.equal(m("Boys C"), 300); a.ok(L.fares("Chennai Airport", "Main Gate")[0].price > 1000); });
t("same-train groups rank first", () => {
  const r = L.rank([{ time: "08:00", members: [{ train: "" }] }, { time: "09:00", members: [{ train: "12607 Lalbagh" }] }], { train: "12607lalbagh" });
  a.equal(r[0].time, "09:00");
});
t("codes unique, format A1..Z26", () => { const u = new Set(); for (let i = 0; i < 676; i++) { const c = L.genCode(u); a.match(c, /^[A-Z](?:[1-9]|1\d|2[0-6])$/); u.add(c); } a.throws(() => L.genCode(u)); });
t("expiry 12h after travel", () => a.equal(L.expiry("2026-11-01", "10:00").toISOString(), "2026-11-01T16:30:00.000Z"));
t("fares", () => a.equal(L.fares("Katpadi Railway Station").length, 5));
