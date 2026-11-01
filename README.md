# Startup College · UniHub

A campus super-app for VIT Vellore students: one sign-in, then Xerox, Food, Travel, PG and VIT Nav,
all served by one Node server with one look.

```
cd hub && node server.js   # http://localhost:3000
```

- `index.html` + `hub/`: the home page and the server. See [hub/README.md](hub/README.md).
- `food/`, `xerox/`: student ordering plus `staff.html` for canteen and shop staff.
- `travel/`, `pg/`: ride sharing, PGs and roommates.
- `admin/`: staff logins, canteens, shops, PG listings and enquiries.
- `nav/`: VIT Nav (CampusNavi), currently a plan of PRP level 6.
- `legacy/`: the earlier separate apps, for reference.

Setup, test logins and deployment: [SETUP.md](SETUP.md).
