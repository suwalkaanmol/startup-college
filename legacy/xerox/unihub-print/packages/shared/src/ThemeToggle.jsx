// Small light/dark icon button for the header. The choice is remembered; the phone's setting is the default.
import { useState } from 'react';
const svg = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
export const InfoIcon = () => <svg {...svg}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>;
const Sun = () => <svg {...svg}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
const Moon = () => <svg {...svg}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>;
export function initTheme() {
  document.documentElement.dataset.theme = localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
}
export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  const flip = () => { const t = dark ? 'light' : 'dark'; document.documentElement.dataset.theme = t; localStorage.setItem('theme', t); setDark(!dark); };
  return <button className="theme-btn" onClick={flip} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>{dark ? <Sun /> : <Moon />}</button>;
}
