# Xerox module (UniHub Print) for the Campus Hub

This whole folder is the `/xerox/` module. Nothing outside it is touched.

- `index.html`: the student app (entry point). Includes the "← Back to Campus Hub" button (`../index.html`).
- `owner/index.html`: the shop owner app.
- `config.js` and `owner/config.js`: paste your Supabase URL and anon key into each (anon key is public by design).
- `source/`: full source code, database migrations (`source/supabase/migrations`) and the build script.

All paths are relative, and every browser storage key starts with `xerox`.

## Change the code and rebuild
```
cd source
npm install
npm run build:xerox
```
This rebuilds both apps straight into this folder (student at the top, owner in `owner/`). Your `config.js` files are kept in `source/apps/*/public/`, so edit them there before building.

## Database
Run the SQL files in `source/supabase/migrations` in order (001, 002, 006, 007, 008, 009) in the Supabase SQL Editor. Create owner accounts as described in `source/README.md`.
