# Making all four sections work

UniHub itself needs nothing but Node 20: `cd hub && node server.js`. Each section needs its own server or database, and UniHub takes every address and shared password from one file, `hub/.env` (copy `hub/.env.example`). The home screen marks a card "Not connected yet" until its settings are there.

## Food: works already
Food talks to the canteen backend the Food team runs at `unihub-backend-574g.onrender.com`. Nothing to set. The first open after a quiet spell can take up to a minute while that free server wakes up.
- Canteen staff open `food/index.html#staff` (no student sign-in needed).

## PG (PlaceMate): one shared password
PlaceMate runs at `https://placemate-x6pt.onrender.com`.
1. Make up a long random password.
2. PG team: add it as `UNIHUB_SSO_SECRET` in the PlaceMate server settings on Render, and redeploy.
3. You: put the same value in `hub/.env` as `UNIHUB_SSO_SECRET`.
Students then land in PlaceMate already signed in. Before step 2, the PG card opens the PlaceMate start page.

## Travel: server address and one shared password
1. Travel team: deploy `travel/server` with `travel/render.yaml` (it needs a Postgres `DATABASE_URL`, e.g. a free Neon database). Note its address and its `JWT_SECRET`.
2. You: in `hub/.env` set `TRAVEL_API_URL` to that address and `TRAVEL_JWT_SECRET` to that `JWT_SECRET`.
UniHub forwards Travel's requests and live chat to that server, so `travel/config.js` needs no edit and there are no cross-site (CORS) settings to change.

## Xerox: connected
The Xerox team's Supabase project is already filled in (`xerox/config.js` and `xerox/owner/config.js`, a publishable key that is safe to be public). To finish:
1. Xerox team: in that Supabase project, make sure Anonymous sign-ins are on and every file in `xerox/source/supabase/migrations` (001 to 009) has been run.
2. Shop staff accounts: Supabase > Auth > Users > Add user (email + password) for each shop, then `insert into shop_owners (user_id, shop_id) values ('<user uuid>', 'prp');` (shop ids: prp, tt, ganga, little, h-block, j-block). There are no default staff passwords.
3. Staff sign in from the "🔒 Shop Staff Login" button in the corner of the Xerox page (`xerox/owner/index.html`), choose their shop, and see its queue.
To switch projects later, set `XEROX_SUPABASE_URL` and `XEROX_SUPABASE_ANON_KEY` in `hub/.env`; UniHub then serves those instead.

## Email codes
Set `SMTP_URL` and `MAIL_FROM`. With Gmail: turn on 2-step verification, create an app password, and use `smtps://you%40gmail.com:APP_PASSWORD@smtp.gmail.com:465`.

## Put it online
`hub/render.yaml` deploys UniHub on Render (New > Blueprint > `hub/render.yaml`), then paste the settings above into its Environment tab.
