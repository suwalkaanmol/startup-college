# PlaceMate

First module of **UniHub**, a super-app for VIT (Vellore) students. After placements, a student finds same-gender VIT students whose office is nearby, ranks them by roommate compatibility, sends requests, chats in a group (2 to 6 people), picks who they want as roommates, reserves a PG together (2 or 3 people) and earns credits.

- **Stack:** React 18 + Vite 5, react-router 6, lucide-react, self-hosted Inter. Node 20+ (ES modules), Express 4, pg, zod, bcryptjs, jsonwebtoken, helmet, nodemailer. PostgreSQL 14+ with plain SQL migrations.
- **Live updates:** Server-Sent Events at `GET /api/events`, fanned out with PostgreSQL LISTEN/NOTIFY (channel `placemate_events`), so several server instances work. Events are tiny (`{type, ids}`); the client refetches.
- **One process:** Node serves `/api` and the built React app on the same origin.

## Run locally
```
createdb placemate
copy server\.env.example server\.env      (macOS/Linux: cp)   then edit DATABASE_URL if needed
npm run install:all
npm run dev:server        # terminal 1, API on :4000
npm run dev:client        # terminal 2, open http://localhost:5173
```
Without `SMTP_URL`, verification codes are printed in the server log and shown on screen (development only).

## Tests
Create a separate database whose name contains `test` (tests wipe it), set `TEST_DATABASE_URL` in `server/.env`, then:
```
createdb placemate_test
npm test
```
The 7 tests cover validation, CSRF, sign-up and login, tag sanitising, matching and gender separation, requests, chat, bookings, credits, the 3-slot limit, block and report, data export, account deletion and password reset.

## Production build
```
npm run build      # builds client/dist
npm start          # serves API + client on PORT
```
In production the server refuses to start without `SMTP_URL` and a `JWT_SECRET` of 32+ characters.

## Deploy (Docker on Render + Neon + SMTP)
1. **Neon:** create a Postgres database and copy its connection string.
2. **SMTP:** create an account with Brevo or SendGrid and get an SMTP URL (`smtps://user:pass@host:465`). Verify your sender address or domain.
3. **Render:** new Web Service from this repo, runtime Docker. Environment variables:
   `NODE_ENV=production`, `DATABASE_URL` (Neon), `DATABASE_SSL=true`, `JWT_SECRET` (long random), `SMTP_URL`, `MAIL_FROM`, `APP_ORIGIN` (your public URL), `ALLOWED_EMAIL_DOMAIN=vitstudent.ac.in`, `CREDITS_PER_BOOKING=100`, `TERMS_VERSION`.
4. Set the business details as Docker build arguments / build env vars: `VITE_BUSINESS_LEGAL_NAME`, `VITE_BUSINESS_ADDRESS`, `VITE_BUSINESS_EMAIL`, `VITE_BUSINESS_PHONE`, `VITE_GRIEVANCE_OFFICER`, `VITE_GRIEVANCE_EMAIL`, `VITE_JURISDICTION`.
5. Migrations and seed data run automatically on start. Health check path: `/api/health`.

## Launch checklist
- [ ] Fill every `VITE_*` business detail (placeholders start with `TODO`).
- [ ] Have a lawyer review the Privacy Policy, Terms, Refund and Cookie pages.
- [ ] Name a real grievance officer and monitor that mailbox.
- [ ] SMTP working: register a fresh account and receive the code.
- [ ] Strong `JWT_SECRET`; `APP_ORIGIN` matches the live URL (HTTPS).
- [ ] Database backups enabled at your provider.
- [ ] Decide how reports and blocks are reviewed (the `reports` table), and who does it.
- [ ] Replace sample PGs with real listings before taking real bookings.

## How matching works
Candidates are verified users of the same gender with a profile, not you, not blocked either way, whose office is within **your** max distance (haversine km).
Score (0-100) = `round((0.7 * priorityScore + 0.3 * overlap) * 100)`. Your top-3 priorities weigh 3/2/1; `priorityScore` is the weight the candidate also ticked divided by the total; `overlap` is the Jaccard overlap of both tag sets. No priorities means overlap only. If you have no tags, there is no score and results sort by distance. Preferences are optional and positive-only; not ticking a tag just ranks you lower for people who prioritise it.

## Rules enforced by the server
- Max 3 slots = groups you are in + pending requests you sent (per-user advisory lock). One pending request per pair.
- A group can be deleted by either member, unless it has an active booking.
- Blocking hides both ways, cancels pending requests and deletes the shared group (not allowed during a shared active booking).
- One active booking per student. The PG row is locked `FOR UPDATE` and beds are checked inside the transaction. Roommates need a double or triple room. Move-in is between today and 12 months ahead.
- Credits (`CREDITS_PER_BOOKING`, default 100) go to every person on a booking only when it is confirmed, and are reversed if it is cancelled. They are reward points with no cash value.
- No payment is taken anywhere in the app.

## Layout
```
client/   React app (src/pages, components, context, styles.css, business.js)
server/   src/{index,app,config,db,migrate,seed,events,mailer}.js
          src/lib (tags, matching, geo, social, http)  src/middleware  src/routes  src/migrations
          test/api.test.js
```
Tag definitions live only in `server/src/lib/tags.js` and reach the client through `GET /api/meta`.

## Adding other UniHub modules
Keep `/api/auth` and the `users` table as the single login. Give each module its own route prefix (for example `/api/travel`), its own tables (prefixed, referencing `users(id)`), its own migration file, and its own tile in `Layout.jsx`.

## Real PG listings
Insert rows into `pgs` with `is_sample = false`. The "Sample listing" pill and banner appear only for sample rows; update the banner text in `client/src/pages/PGs.jsx` once real inventory exists. Remove the seed's sample PGs when you no longer want them.

## Payments later (Razorpay)
Today a booking is a free reservation. To add payments: create a Razorpay order when a booking is created, confirm it from a signed webhook, and move the booking to `confirmed` (and award credits) only after the webhook succeeds. Then update the Refund & Cancellation page and Terms, which currently say no payments are taken.

## Groups, seats and roommates (v2)
- The person who sends a request chooses the group size (2 to 6). Accepting it creates the group and the sender is its owner.
- A group with free seats is shown to nearby same-gender students as "N seats left". Full groups are hidden. Others send a join request and the owner approves or declines.
- Each person can use at most 3 slots in total (groups joined + pending requests and join requests they sent). Leave a group to free a slot.
- Roommates are chosen by picking: when two people pick each other they are roommates, even inside a bigger group. Two or three roommates can book one PG together (three needs a triple room).
- Leaving a group reopens the seat. When only one person is left the group and its chat are deleted and that person is an individual again. If the owner leaves, the longest-standing member becomes owner.
- Five working days (Mon-Fri) after a confirmed booking's move-in date, those people are removed from their groups automatically (runs at startup and hourly, `server/src/cleanup.js`).
- Blocking someone makes the blocker leave shared groups. Deleting an account leaves groups; the others keep theirs.
- Migration `003_open_groups.sql` runs automatically on start. Old groups become capacity 2 and old confirmations carry over as picks.

## Easiest way on Windows
Double-click `START-PLACEMATE.bat` (see START-HERE.txt). It installs, asks for the database once, builds and opens the app.

## Sign-in (UniHub)
PlaceMate has no login, password or email codes of its own. Students sign in once in UniHub and pick PlaceMate.
- **UniHub -> PlaceMate:** after UniHub logs the student in, its server creates a JWT (HS256) signed with the shared secret `UNIHUB_SSO_SECRET`, valid for about 5 minutes, with claims `sub` (UniHub student id), `name`, `email` (@vitstudent.ac.in), `gender` (`male` or `female`) and optional `regNo`. It then sends the browser to `https://<placemate-url>/sso?token=<jwt>`. PlaceMate creates the student on first visit (later visits update name/email) and starts a 7-day session.
- **Testing without UniHub:** `/login` shows a stand-in UniHub (sign in with name and gender, then a home with the PlaceMate tile). The tile opens PlaceMate through the same `/sso` token path the real UniHub will use, so PlaceMate itself never asks for name or gender. It is on in development. In production it is off unless `ALLOW_DEV_LOGIN=true`, so turn it off before real students use the app.
- Production needs `JWT_SECRET` plus either `UNIHUB_SSO_SECRET` or `ALLOW_DEV_LOGIN=true`. `SMTP_URL` is no longer needed.
- Deleting an account now asks the student to type DELETE (there is no password).
- Migration `004_unihub_login.sql` removes stored passwords and adds `users.external_id`.

### Testing start screen
Without UniHub, PlaceMate opens a small "Welcome to PlaceMate" screen that asks name and gender once, then goes straight into PlaceMate (no UniHub home page in between). Open `http://localhost:4000/?as=Priya&g=female` to skip the form (g = male or female). Sign out returns to the form. When the real UniHub sends students to `/sso`, this screen is never shown.

## Consent
UniHub login does not count as consent to PlaceMate's own terms. On first use (and whenever `TERMS_VERSION` changes) a student sees a "Before you start" screen and must tick the 18+/Terms/Privacy box. Until then the server answers `CONSENT_REQUIRED` for every feature. The time and version are stored on the user.

## Compliance checks done (Oct 30 2026)
Automated accessibility audit (axe, WCAG 2 A/AA) on 14 pages in light and dark: 0 violations. No images, no third-party scripts, fonts or embeds, no analytics or tracking, one essential cookie with a notice. No reviews or testimonials. Sample PGs are labelled "Sample listing" on every card. Still yours to do: real business details, lawyer review, grievance officer.

## Move-in dates (v12)
Every student gives a window (earliest and last date they could move in) and an exact move-in date inside it, with calendar pickers on the first profile screen. Students are listed to each other (matches and open groups) only when their windows overlap; ties are ranked by how close the exact dates are. A student's exact date and window show in their detail view, and the PG reservation date defaults to the student's own date. Profiles saved before this change must add dates before using the app. Migration `005_move_in_dates.sql`.
