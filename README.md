# Startup College · UniHub

A campus super-app for VIT Vellore students: one sign-in, then Xerox, Food, Travel, PG and VIT Nav.

```
cd hub && node server.js   # http://localhost:3000
```

- `index.html` + `hub/`: the main app (sign-in with an emailed code, profile, order history, light/dark). See [hub/README.md](hub/README.md).
- `xerox/`, `food/`, `travel/`, `pg/`: the modules, each with its own README.
- `nav/`: VIT Nav (CampusNavi), currently a static plan of PRP level 6.

Every module page loads `hub/web/theme.css` and `hub/web/sync.js`, so they share one look and the hub's light/dark setting.
