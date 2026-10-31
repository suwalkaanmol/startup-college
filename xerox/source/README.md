# UniHub Print: setup and deployment
1. **Supabase**: create a free project. Auth > Providers: enable *Anonymous sign-ins*. SQL Editor: run `supabase/migrations/001_init.sql`, then `002_owner_storage.sql`.
2. **Owner accounts**: Auth > Users > Add user (email + password) for each shop. Then run: `insert into shop_owners (user_id, shop_id) values ('<user uuid>', 'prp');` (shop ids: prp, tt, ganga, little, h-block, j-block).
3. **Cleanup function**: `supabase functions deploy cleanup`, then schedule it hourly. The service key stays in Supabase, never in the browser.
4. **Vercel**: import the repo twice. Project 1: root `apps/student`; project 2: root `apps/owner`. Build `npm run build`, output `dist`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (anon key only) in both.
5. **Launch date**: token letters start at the date in `pay_order_test` (2026-11-01). Change it to your launch day.

## Before real payments and real users
- Drop `pay_order_test`; add a Razorpay/PhonePe order plus a webhook (Edge Function) that sets `preparing` and issues the token.
- Fill every [PLACEHOLDER] in `Legal.jsx`; get a lawyer to review the policies.
- Self-host Inter under `public/fonts`; add icons to the manifest and a service worker.
