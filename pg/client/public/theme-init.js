// Runs before first paint (external file so the CSP needs no inline scripts).
try { var t = localStorage.getItem('pmtheme'); if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); } catch (e) {}
