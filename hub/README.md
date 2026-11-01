# hub/ — the UniHub server

Zero-dependency Node 20+ server. See ../SETUP.md for running and logins.

- `server.js` config, student sign-in (@vitstudent.ac.in + emailed 6-digit code), profile, order history, live updates (`/api/live`), static files.
- `routes/food.js` canteens, menus, orders with daily tokens, kitchen board.
- `routes/xerox.js` PDF upload, page count, price rules, print queue per shop.
- `routes/travel.js` shared cabs and autos, girls-only rides, group chat, fare split.
- `routes/pg.js` PG listings, saves, enquiries, roommate matching (contacts only when both connect).
- `routes/staff.js` staff and admin logins, staff management, PG admin.
- `lib/` JSON store, JWT, SMTP mailer, scrypt passwords, HTTP helpers, server-sent events.
- `seed.js` first-run canteens, shops, sample menu and listings, staff logins.
- `web/` the hub home page and the shared kit (`kit.js`, `kit.css`, `theme.css`, `sync.js`).
- `test/hub.test.js` run with `npm test`.
