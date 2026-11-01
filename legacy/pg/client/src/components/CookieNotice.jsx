import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function CookieNotice() {
  const [seen, setSeen] = useState(() => { try { return localStorage.getItem('pm-cookienotice') === '1'; } catch { return false; } });
  if (seen) return null;
  const accept = () => { try { localStorage.setItem('pm-cookienotice', '1'); } catch { /* ignore */ } setSeen(true); };
  return (
    <div className="cookie" role="region" aria-label="Cookie notice">
      <p>PlaceMate only uses one essential sign-in cookie and remembers your theme. No tracking or ads. <Link to="/legal/cookies">Cookie Policy</Link></p>
      <button className="btn" onClick={accept}>Got it</button>
    </div>
  );
}
