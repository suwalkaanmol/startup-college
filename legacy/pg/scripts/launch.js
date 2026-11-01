// One-click launcher: installs, asks for the database once, builds, starts, opens the browser.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

console.log('PlaceMate launcher v12');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (args, cwd = root) => {
  const r = spawnSync(npm, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error('\nSomething failed. Send a screenshot of this window.'); process.exit(1); }
};
const ask = (q) => new Promise((res) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); res(a.trim()); }); });

if (!fs.existsSync(path.join(root, 'server/node_modules')) || !fs.existsSync(path.join(root, 'client/node_modules'))) {
  console.log('Installing (first time only, takes a few minutes)...');
  run(['run', 'install:all']);
}

const envFile = path.join(root, 'server/.env');
const readUrl = () => { try { return (fs.readFileSync(envFile, 'utf8').match(/^DATABASE_URL=(.*)$/m) || [])[1] || ''; } catch { return ''; } };
const isLocal = (u) => !u || /localhost|127\.0\.0\.1/.test(u);
if (isLocal(readUrl())) {
  console.log('\nOne-time setup. Paste your Neon connection string (starts with postgresql://).');
  console.log('In Neon: Connect > turn OFF "Connection pooling" > copy the string.');
  let url = '';
  while (!/^postgres(ql)?:\/\//.test(url) || isLocal(url)) {
    url = (await ask('DATABASE_URL: ')).replace(/^["']|["']$/g, '').trim();
    if (!/^postgres(ql)?:\/\//.test(url) || isLocal(url)) console.log('That is not a Neon link. It must start with postgresql:// and contain neon.tech. Try again.');
  }
  fs.writeFileSync(envFile, [
    'NODE_ENV=development', 'PORT=4000', `DATABASE_URL=${url}`, 'DATABASE_SSL=true',
    `JWT_SECRET=${crypto.randomBytes(32).toString('hex')}`, 'SMTP_URL=', 'MAIL_FROM=PlaceMate <no-reply@example.com>',
    'APP_ORIGIN=http://localhost:4000', 'ALLOWED_EMAIL_DOMAIN=vitstudent.ac.in', 'CREDITS_PER_BOOKING=100', 'TERMS_VERSION=2026-10', ''
  ].join('\n'));
  console.log('Saved. You will not be asked again.\n');
}

const dist = path.join(root, 'client/dist/index.html');
const newest = (dir) => { let m = 0; for (const f of fs.readdirSync(dir, { withFileTypes: true })) { if (f.name === 'node_modules' || f.name === 'dist') continue; const p = path.join(dir, f.name); m = Math.max(m, f.isDirectory() ? newest(p) : fs.statSync(p).mtimeMs); } return m; };
if (!fs.existsSync(dist) || fs.statSync(dist).mtimeMs < newest(path.join(root, 'client'))) {
  console.log('Building the app...');
  run(['run', 'build']);
}

console.log('\nStarting PlaceMate at http://localhost:4000  (keep this window open; close it to stop)\n');
const server = spawn(process.execPath, ['src/index.js'], { cwd: path.join(root, 'server'), stdio: 'inherit' });
server.on('exit', (c) => process.exit(c ?? 0));
// Open the browser only once the server really answers (the first start can take a minute while the database is set up).
const waitUp = async () => {
  for (let i = 0; i < 300; i++) {
    try { if ((await fetch('http://localhost:4000/api/health')).ok) return true; } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
};
if (await waitUp()) {
  const open = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', 'http://localhost:4000']] : process.platform === 'darwin' ? ['open', ['http://localhost:4000']] : ['xdg-open', ['http://localhost:4000']];
  console.log('\nPlaceMate is ready. Opening your browser...\n');
  try { spawn(open[0], open[1], { stdio: 'ignore', detached: true }).unref(); } catch {}
}
