export const GIRLS = "ABCDEFGHJS".split(""), BOYS = "ABCDEGHJKLMNPQRT".split("");
export const DESTS = ["Katpadi Railway Station", "New Vellore Bus Stand", "Chittoor Bus Stand", "Old Bus Stand", "Chennai Airport", "Bangalore Airport"];
export const DEST_ADDR = { "Katpadi Railway Station": "Katpadi Junction Railway Station, Vellore", "New Vellore Bus Stand": "New Bus Stand, Vellore", "Chittoor Bus Stand": "Chittoor Bus Stand, Chittoor",
  "Old Bus Stand": "Old Bus Stand, Vellore", "Chennai Airport": "Chennai International Airport, Chennai", "Bangalore Airport": "Kempegowda International Airport, Bengaluru" };
// Trains that serve Katpadi Jn (partial list). Unknown numbers are still accepted and matched by number.
export const TRAINS = { 12607: "Lalbagh Express", 12608: "Lalbagh Express", 12639: "Brindavan Express", 12640: "Brindavan Express", 12027: "Chennai–Bengaluru Shatabdi", 12028: "Bengaluru–Chennai Shatabdi",
  12007: "Chennai–Mysuru Shatabdi", 12008: "Mysuru–Chennai Shatabdi", 22625: "Chennai–Bengaluru Double Decker", 22626: "Bengaluru–Chennai Double Decker", 12657: "Chennai–Bengaluru SF Mail", 12658: "Bengaluru–Chennai SF Mail",
  12679: "Chennai–Coimbatore Intercity", 12680: "Coimbatore–Chennai Intercity", 22637: "West Coast Express", 22638: "West Coast Express", 12601: "Chennai–Mangaluru Mail", 12602: "Mangaluru–Chennai Mail",
  20607: "Chennai–Mysuru Vande Bharat", 20608: "Mysuru–Chennai Vande Bharat", 12625: "Kerala Express", 12626: "Kerala Express", 22503: "Dibrugarh–Kanniyakumari Vivek Express", 22639: "Chennai–Alappuzha SF Express",
  22640: "Alappuzha–Chennai SF Express", 22646: "Indore–Kochuveli Ahilyanagari Express", 22647: "Korba–Kochuveli Express", 12835: "Hatia–SMVT Bengaluru Express", 12836: "SMVT Bengaluru–Hatia Express",
  16340: "Nagercoil–Mumbai LTT Express", 16780: "Rameswaram–Tirupati Express", 22716: "Madurai–Kacheguda SF Express", 12690: "Kanniyakumari–Chennai SF Express", 16787: "Tirunelveli–Katra Express",
  56881: "Katpadi–Villupuram Passenger", 56883: "Katpadi–Villupuram Passenger" };
export const trainName = n => TRAINS[n] || "";
// Approximate map points for app links (the pickup pin can be adjusted inside the app). Bus stands are left out until verified.
export const PLACE_LL = { vit: [12.968072, 79.156065], "Katpadi Railway Station": [12.9722, 79.1376], "Chennai Airport": [12.9941, 80.1709], "Bangalore Airport": [13.1986, 77.7066] };
