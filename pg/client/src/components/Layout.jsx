// App shell: header, welcome banner, 6-tile navigation with live badges, footer.
import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Home, Moon, Settings, Sun, LogOut, Users, Inbox, MessageCircle, Building2, CalendarCheck, UserRound, Coins } from 'lucide-react';
import { api, useLive } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import Footer from './Footer.jsx';

const TILES = [
  ['/matches', 'Find Roommates', Users], ['/requests', 'Requests', Inbox, 'requests'], ['/groups', 'Groups & Chat', MessageCircle, 'unread'],
  ['/pgs', 'Find PGs', Building2], ['/bookings', 'My Bookings', CalendarCheck, 'bookings'], ['/profile', 'My Profile', UserRound],
];

export default function Layout() {
  const { user, profile, logout } = useAuth();
  const { isDark, toggle } = useTheme();
  const { pathname } = useLocation();
  const [badges, setBadges] = useState({ requests: 0, unread: 0, bookings: 0 });
  const [credits, setCredits] = useState(null);

  const refresh = useCallback(async () => {
    if (!profile) return;
    try {
      const [rq, gr, bk, cr] = await Promise.all([api.get('/requests'), api.get('/groups'), api.get('/bookings'), api.get('/bookings/credits')]);
      setBadges({ requests: rq.incoming.length + (rq.joinIncoming?.length || 0), unread: gr.groups.reduce((s, g) => s + g.unread, 0), bookings: bk.bookings.filter((b) => b.awaitingMe).length });
      setCredits(cr.balance);
    } catch { /* badges are best effort */ }
  }, [profile]);
  useEffect(() => { refresh(); }, [refresh, pathname]);
  useLive(refresh);

  return (
    <>
      <a href="#main" className="skip">Skip to content</a>
      <header className="header">
        <Link to="/" className="brand"><Home size={22} aria-hidden="true" /><span>PlaceMate · UniHub</span></Link>
        <div className="header-actions">
          <button className="icon-btn" onClick={toggle} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>{isDark ? <Sun size={20} /> : <Moon size={20} />}</button>
          <Link className="icon-btn" to="/settings" aria-label="Settings"><Settings size={20} /></Link>
          <button className="icon-btn" onClick={logout} aria-label="Sign out"><LogOut size={20} /></button>
        </div>
      </header>
      <main id="main" className="container">
        <section className="banner">
          <div><h1>Welcome, {user.name.split(' ')[0]}!</h1><p>Find roommates from VIT near your new office, then book a PG together.</p></div>
          <Link to="/credits" className="credits-chip"><Coins size={16} aria-hidden="true" /> {credits ?? 0} credits</Link>
        </section>
        <nav className="tiles" aria-label="Main">
          {TILES.map(([to, label, Icon, key]) => (
            <NavLink key={to} to={to} className={({ isActive }) => `tile ${isActive || (to === '/groups' && pathname.startsWith('/groups')) ? 'active' : ''}`}>
              <Icon size={24} aria-hidden="true" /><span>{label}</span>
              {key && badges[key] > 0 && <span className="badge" aria-label={`${badges[key]} new`}>{badges[key]}</span>}
            </NavLink>
          ))}
        </nav>
        <Outlet context={{ refreshBadges: refresh }} />
      </main>
      <Footer />
    </>
  );
}
