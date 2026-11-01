# Go2Gether – VIT Travel Buddy
Share cabs/autos with fellow VIT students. React (Vite) frontend · Node/Express + Socket.IO backend · Postgres (Supabase).

## How people get in
There is **no login or registration screen**. The app opens straight into the planner.
- **Standalone (default):** the first visit creates a profile for that device (`Guest1234`) with a Boys/Girls switch on the planner. Controlled by `ALLOW_GUESTS` on the server (default on).
- **With the main app:** the main app opens this app with a signed token, `https://<this-app>/#token=<JWT>` (HS256, signed with the same `JWT_SECRET` as this server; claims `sub`, `username`, `gender` = `male`/`female`, `exp`). The token wins over the device profile, and the server creates the person's profile on first sight. When the main app is live, set `ALLOW_GUESTS=false` so only real sign-ins work.
- Optional `VITE_MAIN_APP_URL` adds a back arrow to the main app.
- If you embed this app in an iframe, remove the `X-Frame-Options: DENY` header in `client/vercel.json`.

## Run locally
1. `cd server && cp .env.example .env` → fill `DATABASE_URL` and `JWT_SECRET`.
2. `cd client && cp .env.example .env` (leave `VITE_API_URL` empty locally).
3. Terminal A: `cd server && npm install && npm run dev`. Terminal B: `cd client && npm install && npm run dev`.
4. Get a test sign-in: `cd server && npm run token -- alice female`, then open `http://localhost:5173/#token=<printed token>`.
5. Tests: `cd server && npm test` (set `TEST_DATABASE_URL` to also run against a real Postgres).

## Deploy
Supabase (database) → Render (`server/`, Node web service) → Vercel (`client/`, Vite). Env vars:
- Render: `DATABASE_URL`, `JWT_SECRET` (must equal the main app's signing secret), `NODE_ENV=production`, `CLIENT_URL=https://<your-site>.vercel.app`
- Vercel: `VITE_API_URL=https://<your-api>.onrender.com` (no trailing slash, no /api); optional `VITE_MAIN_APP_URL`

## Keep the free server awake (recommended)
Render's free tier sleeps after ~15 min idle. Add a free monitor at uptimerobot.com: HTTP(s) monitor on `https://<your-api>.onrender.com/api/health`, every 5 minutes.

## Campus super-app integration (lives in `/travel/`)
This folder is the **Travel** module of `startup-college`. Everything is inside `/travel/`; the repo root and other modules are untouched.
- **Entry:** `travel/index.html` (built output, relative `./assets/...` paths) - the hub opens it via `./travel/index.html`. A **← Back to Campus Hub** button (`../index.html`) sits at the top.
- **Backend URL:** edit `travel/config.js` → `API_URL: "https://<your-api>.onrender.com"` (no rebuild needed). CORS: set `CLIENT_URL` on Render to the origin serving the super-app (e.g. `https://suwalkaanmol.github.io`).
- **Storage keys** are all prefixed `travel_` (`travel_token`, `travel_user`, `travel_theme`, `travel_draft<id>`).
- **Edit the UI:** change `client/src`, then `npm run install:all` (first time) and `npm run build` here. This regenerates `travel/index.html` + `travel/assets/`; commit them.
- **Test locally from a subfolder:** serve the repo root (e.g. `npx serve .`) and open `/travel/`. Opening the file directly (`file://`) will not work because browsers block ES modules there.
