// Builds both apps and copies them into the /xerox/ folder (the folder above this source folder):
// student app -> /xerox/index.html + assets, owner app -> /xerox/owner/
import { execSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const src = resolve(fileURLToPath(new URL('.', import.meta.url)), '..'), out = resolve(src, '..');
execSync('npm run build -w apps/student && npm run build -w apps/owner', { cwd: src, stdio: 'inherit' });
for (const old of ['assets', 'owner']) rmSync(resolve(out, old), { recursive: true, force: true }); // drop stale hashed files
cpSync(resolve(src, 'apps/student/dist'), out, { recursive: true });
cpSync(resolve(src, 'apps/owner/dist'), resolve(out, 'owner'), { recursive: true });
console.log('Built into', out);
