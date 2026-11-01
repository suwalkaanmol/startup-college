# PlaceMate: status

All pending work from the earlier handoff is finished and verified on Node 22 + PostgreSQL 16.

## Done and verified
- Backend: 7/7 `node:test` tests pass (`npm test`).
- Client builds (`npm run build`). All pages exist: auth, profile, matches, requests, groups/chat, PGs, bookings, credits, settings, legal (privacy, terms, refunds, cookies) and contact.
- Real-browser run (Chromium, 4 accounts): ranked matches, female sees no males, live request badge, live chat both ways, confirm as roommates, book together, partner accepts, 100 credits each, dark mode, no horizontal overflow at 390px on 13 pages, zero console errors.
- Dockerfile and README written. The Docker image itself was not built here (no Docker in the sandbox).

## Bugs found on first real run and fixed
1. `npm test` script used `node --test test/` (fails on Node 22); now `node --test test/api.test.js`.
2. `keyGeneratorIpFallback` rate-limit option was rejected; removed.
3. Matching test was polluted by users from earlier tests; assertion now ignores them.
4. `RequireProfile` did not pass the Layout outlet context, which crashed Matches, Requests, Groups, PGs and Bookings (`refreshBadges` undefined).
5. DATE columns are now returned as plain `YYYY-MM-DD` strings (no timezone shift of move-in dates).
6. `Groups.jsx` `reload` is memoised (no extra refetch loops).

## Before launch
- Set the `VITE_*` business details and have a lawyer review the legal pages.
- Add SMTP and a 32+ char `JWT_SECRET`; deploy per README.
- Build and run the Docker image once.

## Added after the first release
- **Why you match:** the match modal shows "You both: ..." (shared tags). `GET /matches/:id` now returns `shared`.
- **Icebreakers:** an empty chat shows four tap-to-fill starter questions (client only, `ICEBREAKERS` in `Groups.jsx`).
- **Roommate checklist:** migration `002_agreements.sql`, `server/src/lib/agreements.js` (items), `GET/POST /api/groups/:id/agreements`, `components/Checklist.jsx`. Available once both confirm as roommates. Ticks update live for both people.
- Tests are now 9/9. Browser regression (26 checks) passes.
- Fixed a latent chat bug: overlapping fetches (send + live event) could show a message twice.

## v2: open groups
See "Groups, seats and roommates (v2)" in README.md. Key files: `server/src/lib/groups.js`, `server/src/cleanup.js`, `server/src/routes/groups.js` (GET /open, POST /:id/join, /join-requests/:rid/accept|decline|cancel, POST /:id/pick, DELETE /:id = leave), `requests.js` (groupSize), `bookings.js` (withUserIds, up to 2 partners), client `Matches.jsx`, `Requests.jsx`, `Groups.jsx`, `PGs.jsx`.
Defaults chosen: owner approves joins, max group 6, 2-3 roommates can book together. Tests: 14/14 API tests, 29 real-browser checks, zero console errors, no overflow at 390px.
Not tested: the Docker image.

## v4: UniHub sign-in
Login, register, verify, forgot and reset were removed. See "Sign-in (UniHub)" in README.md. Server: `routes/auth.js` (`/auth/sso`, `/auth/dev/*`, `/auth/me`, `/auth/logout`). Client: `pages/Auth.jsx` (`/sso`, `/login` test picker). 14/14 API tests and 31 browser checks pass. Mail code (`mailer.js`) is now unused.
