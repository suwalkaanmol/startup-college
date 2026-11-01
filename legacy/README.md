# Legacy modules

These are the first versions of Food, Xerox, Travel and PG, built separately by the team before UniHub.
They needed their own servers (the Food team's backend, a Supabase project for Xerox, and Node + Postgres servers for Travel and PG).

UniHub now runs all four from one server (`hub/`), with new pages in `food/`, `xerox/`, `travel/` and `pg/`.
Nothing here is served by UniHub. The code is kept for reference: the Xerox price rules, Travel's destinations and
the PG matching ideas carried over into `hub/routes/`.
