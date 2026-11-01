import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const foodDir = path.resolve(__dirname, '..');

console.log('Running food module verification tests...');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✓ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`✗ FAIL: ${message}`);
    failCount++;
  }
}

// 1. Entry point food/index.html
const indexPath = path.join(foodDir, 'index.html');
assert(fs.existsSync(indexPath), 'food/index.html exists');

const htmlContent = fs.readFileSync(indexPath, 'utf-8');
assert(htmlContent.includes('./assets/'), 'food/index.html contains relative asset paths (./assets/)');

// 2. Asset files exist
const jsMatch = htmlContent.match(/src="\.\/assets\/([^"]+)"/);
assert(jsMatch && fs.existsSync(path.join(foodDir, 'assets', jsMatch[1])), `Referenced JS asset exists: assets/${jsMatch ? jsMatch[1] : 'none'}`);

const cssMatch = htmlContent.match(/rel="stylesheet"[^>]+href="\.\/assets\/([^"]+)"/) || htmlContent.match(/href="\.\/assets\/([^"]+\.css)"/);
assert(cssMatch && fs.existsSync(path.join(foodDir, 'assets', cssMatch[1])), `Referenced CSS asset exists: assets/${cssMatch ? cssMatch[1] : 'none'}`);

// 3. Back to Campus Hub link in source
const appSource = fs.readFileSync(path.join(foodDir, 'src', 'App.jsx'), 'utf-8');
assert(appSource.includes('<a href="../index.html"'), 'App.jsx includes <a href="../index.html">');
assert(appSource.includes('← Back to Campus Hub'), 'App.jsx includes "← Back to Campus Hub" text');

// 4. Default view is student
assert(appSource.includes("useState('student')"), "App.jsx defaults to 'student' view");

// 5. Canteen Staff Login is present
assert(appSource.includes('Canteen Staff Login'), 'App.jsx includes "Canteen Staff Login"');

// 6. LocalStorage keys in student and owner
const studentAppSource = fs.readFileSync(path.join(foodDir, 'src', 'student', 'StudentApp.jsx'), 'utf-8');
assert(studentAppSource.includes("LOCAL_STORAGE_ORDERS_KEY = 'food_student_orders'"), "Student orders key is 'food_student_orders'");

const studentThemeSource = fs.readFileSync(path.join(foodDir, 'src', 'student', 'theme.js'), 'utf-8');
assert(studentThemeSource.includes("STUDENT_THEME_STORAGE_KEY = 'food_student_theme'"), "Student theme key is 'food_student_theme'");

const ownerApiSource = fs.readFileSync(path.join(foodDir, 'src', 'owner', 'api.js'), 'utf-8');
assert(ownerApiSource.includes("OWNER_TOKEN_KEY = 'food_owner_auth_token'"), "Owner token key is 'food_owner_auth_token'");
assert(ownerApiSource.includes("OWNER_USER_KEY = 'food_owner_user'"), "Owner user key is 'food_owner_user'");

const ownerThemeSource = fs.readFileSync(path.join(foodDir, 'src', 'owner', 'theme.js'), 'utf-8');
assert(ownerThemeSource.includes("OWNER_THEME_STORAGE_KEY = 'food_owner_theme'"), "Owner theme key is 'food_owner_theme'");

// 7. No .env files copied into food
const envFiles = fs.readdirSync(foodDir).filter(f => f.startsWith('.env'));
assert(envFiles.length === 0, 'No .env files present in food module');

console.log(`\nVerification complete: ${passCount} passed, ${failCount} failed.`);
if (failCount > 0) process.exit(1);
