# UniHub (the main app)

UniHub is the front door of Startup College. Students sign in once with their `@vitstudent.ac.in` email and a 6-digit code, fill in their profile, and open Xerox, Food, Travel, PG and VIT Nav from one home screen.

This folder holds:

- `server.js`: the UniHub server. It serves the whole campus site (root `index.html` plus every module folder) and the sign-in API. No npm packages are needed.
- `web/`: the hub's own scripts and styles, plus two files every module loads:
  - `web/theme.css`: the shared look (one blue family, several gradients, Sora + DM Sans). It maps each module's own colour variables onto the shared ones.
  - `web/sync.js`: applies the light/dark choice from the profile, and sends signed-out students back to sign in.
- `lib/`: signed tokens (`jwt.js`), a small SMTP client (`mailer.js`) and a JSON-file store (`store.js`).
- `test/`: `npm test` runs 7 tests (sign-in, profile, hand-off tokens, account deletion, private files, SMTP, Travel forwarding).

Step-by-step setup for every section is in [../SETUP.md](../SETUP.md).

The root also has `manifest.webmanifest` and `sw.js`, so students can install UniHub on their phone. The service worker caches only the hub and VIT Nav; module pages and every `/api` call always go to the network.

## Run it

```
cd hub
node server.js        # or: npm start
```

Open http://localhost:3000. Node 20 or newer.

Without `SMTP_URL`, the server is in test mode: the sign-in code is printed in the terminal and shown on the code screen, so you can try everything without an email account.

## Settings (`hub/.env`)

Copy `.env.example` to `.env` and fill in what you need.

| Setting | What it does |
| --- | --- |
| `JWT_SECRET` | Signs sign-in sessions. Required in production, 32+ characters. |
| `SMTP_URL` | Where codes are emailed from, e.g. `smtps://you%40gmail.com:APP_PASSWORD@smtp.gmail.com:465` (a Gmail app password works). |
| `MAIL_FROM` | Sender shown in the email, e.g. `UniHub <you@gmail.com>`. |
| `TRAVEL_JWT_SECRET` | Must equal `JWT_SECRET` on the Travel server. Lets students open Travel already signed in. |
| `UNIHUB_SSO_SECRET` | Must equal `UNIHUB_SSO_SECRET` on the PG (PlaceMate) server. |
| `PG_URL` | Where PlaceMate runs (default `https://placemate-x6pt.onrender.com`). |
| `TRAVEL_API_URL` | The Travel server. UniHub forwards `/api/*` and `/socket.io/*` there. |
| `XEROX_SUPABASE_URL`, `XEROX_SUPABASE_ANON_KEY` | Served to the Xerox pages as their `config.js`. |
| `ALLOWED_DOMAIN` | Default `vitstudent.ac.in`. |
| `DATA_FILE` | Where accounts are stored (default `hub/data/hub.json`). |

## How each module connects

- **Xerox** and **Food** open directly. They keep their own servers (Supabase for Xerox, the UniHub canteen backend for Food).
- **Travel**: the hub signs a token with `TRAVEL_JWT_SECRET` and opens `travel/index.html#token=...`, which Travel's code already reads. The hub forwards Travel's API and websockets to `TRAVEL_API_URL`.
- **PG**: the hub signs a 5-minute token with `UNIHUB_SSO_SECRET` and opens `PG_URL/sso?token=...`, the hand-off PlaceMate already supports.
- **VIT Nav**: `nav/index.html`, a PRP level 6 plan. `nav/index.html#room=614` opens on a room. Editing comes later.

Until the Travel and PG secrets are set, those tiles still open (Travel as a guest, PG on its start page) and the hub shows a note.

## Sign-in rules

- Only `@vitstudent.ac.in` addresses can ask for a code.
- Codes last 10 minutes, work once, and lock after 5 wrong tries.
- A new code can be requested every 30 seconds, up to 6 an hour per email, and 20 per 15 minutes per network.
- Sessions last 30 days in an HttpOnly cookie.

## Deploy

`hub/render.yaml` is a Render blueprint for the hub. It runs `node hub/server.js` from the repo root so it can serve every module folder. The JSON store needs a persistent disk; move to Postgres before many students use it.
