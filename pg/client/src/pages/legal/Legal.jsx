// Legal pages and Contact. Business details come from client/src/business.js (VITE_* env vars).
import { Link, useParams } from 'react-router-dom';
import { business as b } from '../../business.js';

const UPDATED = 'October 2026';
const Page = ({ title, children }) => <div className="container legal"><div className="card"><h1>{title}</h1><p className="hint">Last updated: {UPDATED}</p>{children}</div></div>;
const Sec = ({ h, children }) => <section><h2>{h}</h2>{children}</section>;

function Privacy() {
  return (<Page title="Privacy Policy">
    <p>PlaceMate is a student-run service for VIT students. This policy explains how we handle your personal data under the Digital Personal Data Protection Act, 2023 (India). {b.legalName} is the data fiduciary.</p>
    <Sec h="What we collect"><ul>
      <li>Account: your name, VIT registration number, VIT email and gender, received from UniHub when you sign in. PlaceMate stores no password.</li>
      <li>Profile: your company, the office location you choose from a list, your maximum distance, and optionally your moving-in month, budget, a short bio and roommate preferences.</li>
      <li>Activity: roommate requests, group chat messages, bookings, credits, blocks and reports you file.</li>
      <li>Technical: a sign-in cookie. We do not collect your phone number, photos, precise location or payment details.</li></ul></Sec>
    <Sec h="Why we use it"><p>To verify you are a VIT student, match you with other students of the same gender whose office is near yours, run requests, chats, reservations and credits, keep the service safe, and and show you in UniHub. You accepted the terms when you signed up to UniHub.</p></Sec>
    <Sec h="Who sees what"><ul>
      <li>Other students see your name, company, office area, distance, bio and preferences. Only students of your own gender can see you. Your registration number and email are never shown to them.</li>
      <li>Only the members of a group can read its chat. Students nearby can see that a group has free seats, with its members' names, company and office area.</li>
      <li>An email service sends our verification emails. We do not sell your data or share it for advertising.</li>
      <li>We may disclose data if the law requires it.</li></ul></Sec>
    <Sec h="How long we keep it"><p>We keep your data while your account exists. When you delete your account, your profile, requests and credits are deleted, and you leave your groups. A group left with fewer than 2 people is deleted together with its chat. Five working days after the move-in date of a confirmed PG booking, you leave your groups automatically. Reports about conduct may be kept for a limited period where needed to keep students safe or to meet a legal duty.</p></Sec>
    <Sec h="Your rights"><p>You can access and download your data and correct your profile in the app. You can withdraw consent and delete your account in Settings. You can also ask for any of this, or make a complaint, using the contact details below.</p></Sec>
    <Sec h="Grievance officer"><p>{b.grievanceOfficer}<br />Email: {b.grievanceEmail}<br />{b.legalName}, {b.address}</p>
      <p>If we do not resolve your complaint, you may approach the Data Protection Board of India.</p></Sec>
    <Sec h="Changes"><p>If we change this policy in a way that matters, we will tell you in the app before it applies.</p></Sec>
  </Page>);
}

function Terms() {
  return (<Page title="Terms of Use">
    <Sec h="Who can use PlaceMate"><p>You must be 18 or older and a current or former VIT student with a valid VIT email. PlaceMate is a student-run service. It is not operated, endorsed or supported by VIT.</p></Sec>
    <Sec h="What PlaceMate does"><p>We help you find students to share a PG with and to reserve a PG bed. We do not own or run any PG, and we do not guarantee that any match, roommate or room will suit you.</p></Sec>
    <Sec h="Staying safe"><p>Meet new people in public places first. Do not share passwords, financial details or other sensitive information in chat. Visit a PG and read its terms before paying anything. Use Block and Report if someone makes you uncomfortable.</p></Sec>
    <Sec h="Acceptable use"><ul><li>Give true information and use only your own account.</li><li>Do not harass, threaten, scam or impersonate anyone, or send unlawful or inappropriate content.</li><li>Do not scrape the service, probe it for weaknesses or try to evade its limits.</li></ul>
      <p>We may suspend or remove accounts that break these rules.</p></Sec>
    <Sec h="Sample listings and reservations"><p>The PGs shown for now are sample listings, labelled "Sample listing", and are not real offers. A reservation in PlaceMate is free and takes no payment. Any money you pay to a PG is governed by that PG's own terms.</p></Sec>
    <Sec h="Credits"><p>Credits are reward points with no cash value; ways to use them will be announced. They cannot be sold, transferred or exchanged for money, and they are taken back if the booking that earned them is cancelled.</p></Sec>
    <Sec h="Liability"><p>PlaceMate is provided as is. To the extent the law allows, we are not responsible for what other users say or do, for the condition or terms of any PG, or for losses from your dealings with other people or PGs. Nothing here limits rights you have under law that cannot be excluded.</p></Sec>
    <Sec h="Law and courts"><p>These terms are governed by the laws of India. Courts at {b.jurisdiction} have jurisdiction.</p></Sec>
    <Sec h="Contact"><p>Questions? See <Link to="/contact">Contact</Link>.</p></Sec>
  </Page>);
}

function Refunds() {
  return (<Page title="Refund &amp; Cancellation">
    <Sec h="No payments in PlaceMate"><p>PlaceMate does not take any payment today. Reserving a bed costs nothing, so there is nothing to refund.</p></Sec>
    <Sec h="Cancelling a reservation"><p>You can cancel a reservation for free at any time from My Bookings. If you booked with a roommate, cancelling ends the reservation for both of you. Credits earned from that booking are taken back.</p></Sec>
    <Sec h="Money you pay to a PG"><p>Rent and deposit are paid directly to the PG at move-in. Refunds of those amounts follow the PG's own terms, so read them before paying. PlaceMate is not a party to that payment.</p></Sec>
    <Sec h="Help"><p>If you have a problem with a reservation, contact us through <Link to="/contact">Contact</Link>.</p></Sec>
  </Page>);
}

function Cookies() {
  return (<Page title="Cookie Policy">
    <p>PlaceMate uses only what it needs to work. We use no analytics, advertising or tracking cookies, and no third-party scripts.</p>
    <Sec h="Cookie"><ul><li><strong>pm_session</strong>: an essential cookie that keeps you signed in for up to 7 days. It is httpOnly and cannot be read by scripts.</li></ul></Sec>
    <Sec h="Local storage on your device"><ul>
      <li><strong>pmtheme</strong>: remembers your light or dark choice.</li>
      <li><strong>pm-cookienotice</strong>: remembers that you dismissed the cookie notice.</li></ul>
      <p>You can clear these in your browser settings. Clearing pm_session signs you out.</p></Sec>
  </Page>);
}

function Contact() {
  return (<Page title="Contact">
    <p>PlaceMate is a student-run service and is not operated by VIT.</p>
    <dl className="facts">
      <dt>Business</dt><dd>{b.legalName}</dd><dt>Address</dt><dd>{b.address}</dd>
      <dt>Support email</dt><dd>{b.email}</dd><dt>Phone</dt><dd>{b.phone}</dd>
      <dt>Grievance officer</dt><dd>{b.grievanceOfficer} ({b.grievanceEmail})</dd></dl>
  </Page>);
}

const PAGES = { privacy: Privacy, terms: Terms, refunds: Refunds, cookies: Cookies };
export default function Legal({ contact }) {
  const { doc } = useParams();
  const View = contact ? Contact : PAGES[doc] || Privacy;
  return <View />;
}
