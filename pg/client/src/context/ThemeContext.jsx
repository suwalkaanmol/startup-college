import { createContext, useContext, useEffect, useState } from 'react';
const Ctx = createContext(null);
export const useTheme = () => useContext(Ctx);

/** mode: 'system' | 'light' | 'dark', saved under localStorage "pmtheme". */
export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => { try { return localStorage.getItem('pmtheme') || 'system'; } catch { return 'system'; } });
  useEffect(() => {
    const root = document.documentElement;
    if (mode === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', mode);
    try { mode === 'system' ? localStorage.removeItem('pmtheme') : localStorage.setItem('pmtheme', mode); } catch { /* storage blocked */ }
  }, [mode]);
  const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  return <Ctx.Provider value={{ mode, setMode, isDark, toggle: () => setMode(isDark ? 'light' : 'dark') }}>{children}</Ctx.Provider>;
}
