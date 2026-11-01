// Dev helper: prints a token like the main app will send. Usage: npm run token -- alice female
require("dotenv").config(); const jwt = require("jsonwebtoken");
const [name = "tester", gender = "male"] = process.argv.slice(2);
console.log(jwt.sign({ sub: "dev-" + name, username: name, gender }, process.env.JWT_SECRET, { expiresIn: "7d" }));
