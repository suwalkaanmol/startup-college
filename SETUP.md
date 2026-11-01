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

### Test staff logins (development only)

| Where | Username | Password |
|---|---|---|
| Admin (`/admin/`) | admin | UniHub@Admin1 |
| Food court canteen (`/food/staff.html`) | foodys | Foodys@2026 |
| PRP kiosk canteen | prpkiosk | PrpKiosk@2026 |
| Xerox PRP (`/xerox/staff.html`) | prp | PrpXerox@2026 |
| Xerox TT / Ganga / Little / H / J block | tt, ganga, little, hblock, jblock | TtXerox@2026, GangaXerox@2026, Little@2026, HBlock@2026, JBlock@2026 |

The admin can add more logins, reset passwords, add canteens and manage PG listings.

## In production (Render)

1. New > Blueprint > this repo, path `hub/render.yaml`.
2. Set `ADMIN_PASSWORD`, `SMTP_URL` and `MAIL_FROM` (Gmail app password works for SMTP).
3. On first start, the canteen and shop passwords are random and saved once to
   `/var/data/first-run-logins.txt`. Sign in as admin and reset any of them from the admin panel.

Sample menus and PG listings are marked "Sample" in the app. Replace them from the staff and admin screens.

## Where things are

- `hub/` the server (`server.js`, `routes/`, `lib/`) and the shared look (`hub/web/kit.css`, `theme.css`).
- `food/`, `xerox/`, `travel/`, `pg/`, `admin/` the screens for each section.
- `nav/` CampusNavi.
- `legacy/` the earlier separate apps, kept for reference only (never served).
