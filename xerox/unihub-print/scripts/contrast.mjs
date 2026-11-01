// WCAG AA check of the theme colour pairs (4.5:1 normal text). Run: node scripts/contrast.mjs
const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const themes = { light: { bg: '#e8edf8', card: '#ffffff', tx: '#1a202c', mut: '#4a5568', dis: '#e2e8f0', ok: '#276749', bad: '#c53030', dot: '#4c51bf' },
  dark: { bg: '#111827', card: '#1f2937', tx: '#f7fafc', mut: '#cbd5e0', dis: '#374151', ok: '#9ae6b4', bad: '#feb2b2', dot: '#a3bffa' } };
let fail = 0;
const check = (name, a, b) => { const r = ratio(a, b); if (r < 4.5) fail++; console.log(`${r < 4.5 ? 'FAIL' : 'ok  '} ${r.toFixed(2)}  ${name}`); };
check('white on gradient start #5a67d8', '#ffffff', '#5a67d8'); check('white on gradient end #764ba2', '#ffffff', '#764ba2');
for (const [t, c] of Object.entries(themes)) { for (const k of ['tx', 'mut', 'ok', 'bad', 'dot']) check(`${t}: ${k} on card`, c[k], c.card);
  check(`${t}: mut on page bg`, c.mut, c.bg); check(`${t}: mut on disabled`, c.mut, c.dis); check(`${t}: bad on bg`, c.bad, c.bg); }
process.exit(fail ? 1 : 0);
