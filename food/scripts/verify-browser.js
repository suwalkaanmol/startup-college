import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');
const foodDir = path.resolve(__dirname, '..');

console.log('--- Final Pre-Push Verification Suite ---');

let passed = 0;
let failed = 0;

function test(desc, condition) {
  if (condition) {
    console.log(`✓ PASS: ${desc}`);
    passed++;
  } else {
    console.error(`✗ FAIL: ${desc}`);
    failed++;
  }
}

// 1. Root index.html check
const rootIndexPath = path.join(rootDir, 'index.html');
test('Root index.html exists', fs.existsSync(rootIndexPath));
const rootHtml = fs.readFileSync(rootIndexPath, 'utf-8');
test('Root index.html contains Food module launch', rootHtml.includes("launchModule('food')") && rootHtml.includes('window.location.href = `./${moduleName}/index.html`'));

// 2. Food entry point check
const foodIndexPath = path.join(foodDir, 'index.html');
test('food/index.html exists as production entry point', fs.existsSync(foodIndexPath));
const foodHtml = fs.readFileSync(foodIndexPath, 'utf-8');

// 3. Asset linkage
const scriptMatches = [...foodHtml.matchAll(/src="(\.[^"]+)"/g)].map(m => m[1]);
const cssMatches = [...foodHtml.matchAll(/href="(\.[^"]+\.css)"/g)].map(m => m[1]);

test('food/index.html references production JS bundle via relative path', scriptMatches.length > 0 && scriptMatches[0].startsWith('./assets/'));
test('food/index.html references production CSS stylesheet via relative path', cssMatches.length > 0 && cssMatches[0].startsWith('./assets/'));

for (const relScript of scriptMatches) {
  const fullPath = path.join(foodDir, relScript);
  test(`Bundled script ${relScript} exists on disk`, fs.existsSync(fullPath));
  const stat = fs.statSync(fullPath);
  test(`Bundled script ${relScript} is non-trivial (>50KB, actual: ${Math.round(stat.size / 1024)}KB)`, stat.size > 50000);
}

for (const relCss of cssMatches) {
  const fullPath = path.join(foodDir, relCss);
  test(`Bundled stylesheet ${relCss} exists on disk`, fs.existsSync(fullPath));
  const stat = fs.statSync(fullPath);
  test(`Bundled stylesheet ${relCss} is non-trivial (>20KB, actual: ${Math.round(stat.size / 1024)}KB)`, stat.size > 20000);
}

// 4. Inspection of JS Bundle Contents
const mainJsRel = scriptMatches.find(s => s.endsWith('.js'));
if (mainJsRel) {
  const jsContent = fs.readFileSync(path.join(foodDir, mainJsRel), 'utf-8');

  // Verify Student App features
  test('Bundle contains Student App pre-ordering features', jsContent.includes('Student Pre-order') || jsContent.includes('canteen-pill-btn'));
  test('Bundle contains Category Navigation and Dietary filters', jsContent.includes('category') && (jsContent.includes('veg') || jsContent.includes('non-veg')));
  test('Bundle contains Cart & Checkout functionality', jsContent.includes('cart') && jsContent.includes('Checkout'));
  test('Bundle contains Token lookup / My Orders modal', jsContent.includes('My Orders') || jsContent.includes('orders-counter'));

  // Verify Owner App features
  test('Bundle contains Owner / Kitchen Staff portal features', jsContent.includes('Kitchen & Staff Portal') || jsContent.includes('Authorized Kitchen'));
  test('Bundle contains Owner login form', jsContent.includes('Sign In to Kitchen Portal') || jsContent.includes('login-input'));
  test('Bundle contains Token verification counter', jsContent.includes('Token') || jsContent.includes('daily_token'));
  test('Bundle contains Stock / Menu management modal', jsContent.includes('Menu & Stock') || jsContent.includes('stock-btn'));

  // Verify View Switching and Campus Navigation
  test('Bundle contains discreet Canteen Staff Login switcher', jsContent.includes('Canteen Staff Login'));
  test('Bundle contains Return to Student Ordering switcher', jsContent.includes('Student Ordering') || jsContent.includes('Student View'));
  test('Bundle contains back link to Campus Hub: <a href="../index.html">← Back to Campus Hub</a>', jsContent.includes('← Back to Campus Hub') && jsContent.includes('../index.html'));

  // Verify localStorage keys prefixing
  test('Bundle uses food_student_orders storage key', jsContent.includes('food_student_orders'));
  test('Bundle uses food_owner_auth_token storage key', jsContent.includes('food_owner_auth_token'));
  test('Bundle uses food_owner_user storage key', jsContent.includes('food_owner_user'));
  test('Bundle uses food_student_theme storage key', jsContent.includes('food_student_theme'));
  test('Bundle uses food_owner_theme storage key', jsContent.includes('food_owner_theme'));

  // Verify backend endpoints and WebSocket fallbacks
  test('Bundle includes deployed backend fallback URL', jsContent.includes('https://unihub-backend-574g.onrender.com'));
  test('Bundle includes deployed WebSocket fallback URL', jsContent.includes('wss://unihub-backend-574g.onrender.com'));
}

// 5. Public assets check
test('food/icon-192.svg exists', fs.existsSync(path.join(foodDir, 'icon-192.svg')));
test('food/icon-512.svg exists', fs.existsSync(path.join(foodDir, 'icon-512.svg')));
test('food/manifest.json exists', fs.existsSync(path.join(foodDir, 'manifest.json')));

// 6. Template source protection
test('food/template.html exists and is preserved', fs.existsSync(path.join(foodDir, 'template.html')));
const templateContent = fs.readFileSync(path.join(foodDir, 'template.html'), 'utf-8');
test('food/template.html maintains clean unbuilt source link (./src/main.jsx)', templateContent.includes('./src/main.jsx'));

// 7. Hygiene: No .env files or secrets
const foodFiles = fs.readdirSync(foodDir);
test('No .env files exist in food directory', !foodFiles.some(f => f.startsWith('.env')));

console.log(`\n========================================`);
console.log(`Verification Results: ${passed} passed, ${failed} failed`);
console.log(`========================================`);

if (failed > 0) process.exit(1);
