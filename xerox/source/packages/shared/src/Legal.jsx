// DRAFT policy pages. Fill the [PLACEHOLDERS] and have a lawyer review before launch.
import { useEffect, useState } from 'react';
const B = { name: '[BUSINESS NAME]', addr: '[REGISTERED ADDRESS]', email: '[SUPPORT EMAIL]', phone: '[SUPPORT PHONE]', officer: '[GRIEVANCE OFFICER NAME]', gst: '[GST / REGISTRATION NUMBER, if applicable]' };

const PAGES = {
  privacy: ['Privacy Policy', <>
    <p>Draft under the Digital Personal Data Protection Act, 2023. Reviewed by a lawyer: not yet.</p>
    <h3>What we collect</h3><p>Only what printing needs: the files you upload, your print options, order details (shop, price, token, status), chat messages to the shop, and an anonymous device ID created by the app. We do not collect your real name, phone number or email. You may type an optional chat nickname, which is shown to the shop only.</p>
    <h3>Why</h3><p>To print your order, show its status, let you chat with the shop, and keep payment records.</p>
    <h3>How long</h3><p>Uploaded files are deleted when the shop marks your order completed, and automatically after 24 hours if the order is never collected. Order records and chat messages are kept for [RETENTION PERIOD] for accounting and dispute handling.</p>
    <h3>Who can see it</h3><p>Only the shop you chose, and our service providers: Supabase (database, file storage, authentication) and Vercel (hosting). Payment is in test mode; the gateway will be listed here before real payments start.</p>
    <h3>Your rights</h3><p>You may ask to access, correct or erase your data, withdraw consent, and nominate a person to act for you. Write to the grievance contact below.</p>
    <h3>Grievance contact</h3><p>{B.officer}, {B.email}, {B.phone}</p></>],
  terms: ['Terms & Conditions', <>
    <p>Draft. Reviewed by a lawyer: not yet.</p>
    <p>{B.name} provides this service to let students send documents to campus print shops. Each shop sets its own prices and timings. You must own or have the right to print the files you upload. Do not upload unlawful content. Prices shown include all charges; the amount charged is calculated on our server. A token is issued only after successful payment. Payments are currently in test mode and no real money is charged.</p></>],
  refund: ['Refund & Cancellation', <>
    <p>Draft. Reviewed by a lawyer: not yet.</p>
    <p>If a shop is closed, you cannot place an order. If a shop cannot print your order, or it was not printed, you are entitled to a full refund. If you ask for a cancellation before the shop starts printing, you get a full refund. Refunds go to the original payment method within [REFUND DAYS] days. To request one, contact {B.email} with your token.</p></>],
  cookies: ['Cookies Policy', <>
    <p>This app uses only essential browser storage: your anonymous session and your cookie choice. It loads no analytics, advertising or tracking scripts. If we add any in future, they will stay off until you opt in.</p></>],
  about: ['Contact & About', <>
    <p>{B.name}</p><p>Registered address: {B.addr}</p><p>Support: {B.email}, {B.phone}</p><p>Grievance officer: {B.officer}</p><p>Registration/GST: {B.gst}</p>
    <p>Credits: the interface uses no third-party images or logos.</p></>],
};

export const useHashPage = () => {
  const get = () => location.hash.replace('#/', '');
  const [p, setP] = useState(get);
  useEffect(() => { const f = () => setP(get()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return PAGES[p] ? p : null;
};

export function LegalPage({ id }) {
  const [title, body] = PAGES[id];
  return <main><section className="card"><h2>{title}</h2>{body}{id === 'about' && <ul>{Object.entries(PAGES).filter(([k]) => k !== 'about').map(([k, [t]]) => <li key={k}><a href={`#/${k}`}>{t}</a></li>)}</ul>}<a className="ghost" style={{ display: 'block', textAlign: 'center' }} href="#/">Back to the app</a></section></main>;
}


// Essential storage only by default: no tracking is loaded either way.
export function CookieBanner() {
  const [shown, setShown] = useState(() => !localStorage.getItem('xerox-cookie-choice'));
  if (!shown) return null;
  const choose = (v) => { localStorage.setItem('xerox-cookie-choice', v); setShown(false); };
  return <div className="banner" role="region" aria-label="Cookie notice"><p>We use only essential storage to keep you signed in. No tracking. See the <a href="#/cookies">Cookies Policy</a>.</p>
    <button className="primary" onClick={() => choose('essential')}>Accept essential storage only</button></div>;
}
