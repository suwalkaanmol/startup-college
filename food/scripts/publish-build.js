import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const foodDir = path.resolve(__dirname, '..');
const distDir = path.join(foodDir, 'dist');
const distAssetsDir = path.join(distDir, 'assets');
const targetAssetsDir = path.join(foodDir, 'assets');
const distTemplateHtml = path.join(distDir, 'template.html');
const targetIndexHtml = path.join(foodDir, 'index.html');

console.log('[Safe Publish] Starting safe production publish...');

// 1. Verify dist exists and has template.html
if (!fs.existsSync(distTemplateHtml)) {
  console.error('[Safe Publish Error] dist/template.html not found! Run vite build first.');
  process.exit(1);
}

// 2. Ensure food/assets directory exists and clean stale assets
if (fs.existsSync(targetAssetsDir)) {
  for (const f of fs.readdirSync(targetAssetsDir)) {
    fs.unlinkSync(path.join(targetAssetsDir, f));
  }
} else {
  fs.mkdirSync(targetAssetsDir, { recursive: true });
}

// 3. Copy built assets from dist/assets to food/assets
if (fs.existsSync(distAssetsDir)) {
  const assetFiles = fs.readdirSync(distAssetsDir);
  for (const file of assetFiles) {
    const srcPath = path.join(distAssetsDir, file);
    const destPath = path.join(targetAssetsDir, file);
    fs.copyFileSync(srcPath, destPath);
    console.log(`[Safe Publish] Copied asset: assets/${file}`);
  }
}

// 4. Copy public static assets from dist (icons, manifest, sw) if present
const publicFiles = ['icon-192.svg', 'icon-512.svg', 'manifest.json', 'sw.js', '_redirects'];
for (const file of publicFiles) {
  const srcPath = path.join(distDir, file);
  const destPath = path.join(foodDir, file);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`[Safe Publish] Copied static: ${file}`);
  }
}

// 5. Read dist/template.html and safely write to food/index.html
const htmlContent = fs.readFileSync(distTemplateHtml, 'utf-8');
fs.writeFileSync(targetIndexHtml, htmlContent, 'utf-8');
console.log('[Safe Publish] Updated food/index.html with production bundles.');

// 6. Also create dist/index.html for hosting platforms expecting index.html inside dist
const distIndexHtml = path.join(distDir, 'index.html');
fs.writeFileSync(distIndexHtml, htmlContent, 'utf-8');
console.log('[Safe Publish] Created dist/index.html mirror.');

console.log('[Safe Publish] Completed successfully! Production build is active at food/index.html');
