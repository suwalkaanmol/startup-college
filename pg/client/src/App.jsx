// Routing. Guests see auth pages; signed-in users need a profile for most pages.
import { Link, Navigate, Outlet, Route, Routes, useLocation, useOutletContext } from 'react-router-dom';
import { Home } from 'lucide-react';
import { useAuth } from './context/AuthContext.jsx';
import { Spinner } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import Footer from './components/Footer.jsx';
import CookieNotice from './components/CookieNotice.jsx';
import { Consent, Login, Sso } from './pages/Auth.jsx';
import Profile from './pages/Profile.jsx';
import Matches from './pages/Matches.jsx';
import Requests from './pages/Requests.jsx';
import Groups from './pages/Groups.jsx';
import PGs from './pages/PGs.jsx';
import Bookings from './pages/Bookings.jsx';
import Credits from './pages/Credits.jsx';
import Settings from './pages/Settings.jsx';
import Legal from './pages/legal/Legal.jsx';

function GuestOnly() { const { user, loading } = useAuth(); return loading ? <Spinner /> : user ? <Navigate to="/matches" replace /> : <Outlet />; }
function RequireAuth() { const { user, loading } = useAuth(), { search } = useLocation(); return loading ? <Spinner /> : user ? (user.consentNeeded ? <PublicShell consent /> : <Layout />) : <Navigate to={{ pathname: '/login', search }} replace />; }
function ToMatches() { const { search } = useLocation(); return <Navigate to={{ pathname: '/matches', search }} replace />; }
// Passes the Layout's outlet context (refreshBadges) down to the pages inside.
function RequireProfile() { const { profile } = useAuth(), ctx = useOutletContext(); return profile === undefined ? <Spinner /> : (profile === null || !profile.moveInDate) ? <Navigate to="/profile" replace /> : <Outlet context={ctx} />; }

function PublicShell({ consent }) {
  return (<>
    <header className="header"><Link to="/" className="brand"><Home size={22} aria-hidden="true" /><span>PlaceMate · UniHub</span></Link></header>
    <main id="main">{consent ? <Consent /> : <Outlet />}</main><Footer />
  </>);
}

export default function App() {
  return (<>
    <Routes>
      <Route element={<PublicShell />}>
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<Login />} />
        </Route>
        <Route path="/sso" element={<Sso />} />
        <Route path="/legal/:doc" element={<Legal />} />
        <Route path="/contact" element={<Legal contact />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="/profile" element={<Profile />} /><Route path="/settings" element={<Settings />} /><Route path="/credits" element={<Credits />} />
        <Route element={<RequireProfile />}>
          <Route path="/matches" element={<Matches />} /><Route path="/requests" element={<Requests />} />
          <Route path="/groups" element={<Groups />} /><Route path="/groups/:groupId" element={<Groups />} />
          <Route path="/pgs" element={<PGs />} /><Route path="/bookings" element={<Bookings />} />
        </Route>
      </Route>
      <Route path="*" element={<ToMatches />} />
    </Routes>
    <CookieNotice />
  </>);
}
