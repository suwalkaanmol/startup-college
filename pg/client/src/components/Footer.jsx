import { Link } from 'react-router-dom';
import { business } from '../business.js';

export default function Footer() {
  return (
    <footer className="footer">
      <nav aria-label="Legal"><Link to="/legal/privacy">Privacy Policy</Link><Link to="/legal/terms">Terms of Use</Link><Link to="/legal/refunds">Refund &amp; Cancellation</Link><Link to="/legal/cookies">Cookie Policy</Link><Link to="/contact">Contact</Link></nav>
      <p>© {new Date().getFullYear()} {business.legalName}. PlaceMate is a student-run service and is not operated by VIT.</p>
    </footer>
  );
}
