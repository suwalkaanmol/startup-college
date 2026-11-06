# Running UniHub

UniHub is one Node server (Node 20+, no packages to install) that serves the whole app:
student sign-in, Food, Xerox, Travel, PG, staff screens and the admin panel.

## On your computer

```
cd hub
node server.js          # http://localhost:3000
npm test                # 10 automated checks
```

With no `SMTP_URL`, sign-in codes are shown on screen, so you can test without email.

### Owner logins (development only)

Each canteen and each Xerox shop has its own owner login and its own database. On the owner sign-in
screen (Food → Owner login, Xerox → Owner login), pick the place and type its password.

| Place | Password | Staff ID |
|---|---|---|
| KC | KcFood@2026 | kc |
| Darling (DC) | Darling@2026 | darling |
| Hangy & Swig | HangySwig@2026 | hangyswig |
| Garnish | Garnish@2026 | garnish |
| PRP Xerox | PrpXerox@2026 | prp |
| TT Xerox | TtXerox@2026 | tt |
| Ganga Xerox | GangaXerox@2026 | ganga |
| Little Shop Xerox | Little@2026 | little |
| H Block | HBlock@2026 | hblock |
| J Block | JBlock@2026 | jblock |
| UniHub admin (`/admin/`, signs in with the staff ID) | UniHub@Admin1 | admin |

The admin can add more logins, reset passwords, add canteens and manage PG listings.

### Where the data lives

Online these are rows in the `unihub_docs` table (and uploads in `unihub_blobs`); on your computer they are files:

- `hub/data/hub.json`: students, owner logins, the list of canteens and shops, rides, PG.
- `hub/data/places/food-<canteen>.json`: one canteen's menu, stock and orders (one file per canteen).
- `hub/data/places/xerox-<shop>.json` and `xerox-<shop>-uploads/`: one shop's orders, chats and files.

## Put it online (free): Neon + Brevo + Render

Everything is stored in one shared PostgreSQL database, so every student, canteen and shop sees the same data,
and nothing is lost when the server restarts. About 20 minutes, no card needed.

1. **Database (Neon).** Sign up at neon.tech, create a project (region: Singapore or Mumbai if offered), and copy the
   connection string. It looks like `postgresql://user:password@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`.
2. **Email (Brevo).** Sign up at brevo.com. Under Senders, add and verify the address the codes come from
   (your Gmail works). Under SMTP & API → API keys, create a key. Render's free plan blocks SMTP, so UniHub sends
   through Brevo's API instead. The free plan sends 300 emails a day.
3. **Server (Render).** Sign up at render.com with GitHub, then New → Blueprint → this repository. Render reads
   `hub/render.yaml`. Fill in:
   - `DATABASE_URL`: the Neon connection string
   - `ADMIN_PASSWORD`: your admin password (8+ characters, letters and numbers)
   - `BREVO_API_KEY`: the Brevo key
   - `MAIL_FROM`: `UniHub <the-address-you-verified@gmail.com>`
4. Open the `onrender.com` address Render gives you. Sign in at `/admin/` with staff ID `admin` and your password,
   then use **Reset password** on each canteen and shop login and give each owner their password.

**Changing it later:** push to the `feature/hub` branch (or change `branch:` in `hub/render.yaml` after merging to
`main`). Render redeploys by itself in a minute or two; the data in Neon stays as it is.

The free Render server sleeps after 15 minutes with no visitors and takes about a minute to wake. Render's
paid plan (about $7 a month) keeps it awake.

### Other hosts

Any host that runs Node 20+ works: start with `node hub/server.js` and set `NODE_ENV=production`, `JWT_SECRET`
(32+ random characters), `DATABASE_URL`, `ADMIN_PASSWORD`, and `BREVO_API_KEY` (or `SMTP_URL` where SMTP is allowed).
Without `DATABASE_URL` the data is kept in files under `hub/data`, which needs a permanent disk.

To check the database code against your own PostgreSQL: `TEST_DATABASE_URL=postgresql://... npm test` (it wipes the
two UniHub tables in that database).

## Payments

Food and Xerox orders are paid online before they reach the kitchen or print shop, so there is no queue
to pay and nothing is made for no-shows. Payment is in **demo mode**: no money moves, any mobile number
works and the code is `123456`. To take real money, replace `takePayment()` in `hub/lib/pay.js` with a
UPI gateway (Razorpay, Cashfree or PhonePe) and verify its signature there. Cancelled orders are marked refunded.

The four canteen menus come from the Food team's data (KC, Darling, Hangy & Swig, Garnish). Owners change
prices, stock and dishes from their dashboard. PG listings marked "Sample" are examples for the admin to replace.

The Xerox print preview uses pdf.js 3.11.174 (Mozilla, Apache-2.0), kept in `hub/web/vendor/pdfjs/`.

## Where things are

- `hub/` the server (`server.js`, `routes/`, `lib/`) and the shared look (`hub/web/kit.css`, `theme.css`).
- `food/`, `xerox/`, `travel/`, `pg/`, `admin/` the screens for each section.
- `nav/` CampusNavi.
- `legacy/` the earlier separate apps, kept for reference only (never served).
