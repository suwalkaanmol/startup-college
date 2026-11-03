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

- `hub/data/hub.json`: students, owner logins, the list of canteens and shops, rides, PG.
- `hub/data/places/food-<canteen>.json`: one canteen's menu, stock and orders (one file per canteen).
- `hub/data/places/xerox-<shop>.json` and `xerox-<shop>-uploads/`: one shop's orders, chats and files.

## In production (Render)

1. New > Blueprint > this repo, path `hub/render.yaml`.
2. Set `ADMIN_PASSWORD`, `SMTP_URL` and `MAIL_FROM` (Gmail app password works for SMTP).
3. On first start, the canteen and shop passwords are random and saved once to
   `/var/data/first-run-logins.txt`. Sign in as admin and reset any of them from the admin panel.

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
