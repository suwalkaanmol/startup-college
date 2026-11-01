import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';
const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

/** Holds the signed-in user and their profile. `profile === undefined` means still loading. */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const [profile, setProfile] = useState(undefined);

  const loadProfile = useCallback(async () => {
    try { setProfile((await api.get('/profile')).profile); } catch { setProfile(null); }
  }, []);
  useEffect(() => { api.get('/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null)); }, []);
  useEffect(() => { if (user) loadProfile(); else if (user === null) setProfile(undefined); }, [user, loadProfile]);

  const logout = async () => { try { localStorage.removeItem('pm_demo'); } catch {} await api.post('/auth/logout').catch(() => {}); setUser(null); };
  return <Ctx.Provider value={{ user, setUser, profile, loadProfile, logout, loading: user === undefined }}>{children}</Ctx.Provider>;
}
