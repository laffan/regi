# app — the server

Supabase: schema, row level security, database functions, edge functions and
seed data. Everything the iOS and web clients talk to lives here.

```
supabase/
  config.toml            local stack settings
  migrations/            schema, RLS, views, functions, grants
  seed.sql               the demo account the designs were drawn against
  functions/
    parse-log/           text in → typed draft rows (GPT-5.6 Sol, with a fallback)
    food-lookup/         USDA FoodData Central + Open Food Facts, cached
    _shared/             the client, the parsers, the food matching
scripts/
  validate-migrations.sh applies every migration to a throwaway Postgres
  smoke.sql              triggers, rollups, drafts and per-module sharing
```

## Running it

```bash
supabase start                 # local stack (needs Docker)
supabase db reset              # migrations + seed.sql
supabase functions serve       # parse-log and food-lookup
```

`supabase status` prints the API URL and anon key the clients need.

For a hosted project: `supabase link --project-ref <ref>` then `supabase db push`
and `supabase functions deploy parse-log food-lookup`.

## Secrets

The edge functions read these; all three are optional and the app degrades
rather than breaks without them.

| Variable | Used for | Without it |
| --- | --- | --- |
| `OPENAI_API_KEY` | Parsing a log line into typed rows | A deterministic rule-based parser handles the line instead |
| `OPENAI_MODEL` | Which model parses (default `gpt-5.6-sol`) | The default |
| `USDA_FDC_API_KEY` | USDA FoodData Central matches ([key](https://fdc.nal.usda.gov/api-key-signup.html)) | Open Food Facts only |

Open Food Facts needs no key. Set them with
`supabase secrets set OPENAI_API_KEY=… USDA_FDC_API_KEY=…`, or in
`supabase/.env` for local serving.

## The shape of the data

`entries` is the spine: every module writes timestamped rows into it, which is
what lets the calendar render a day summary per module without knowing what any
module is.

| Table | What it holds |
| --- | --- |
| `modules` | The catalog: what each module publishes, subscribes to, and how a day rolls up. Seeded, not user-writable |
| `user_modules` | Activation and per-module settings (the Calories source order, the daily target) |
| `entries` | Every logged thing, with `local_date` as the calendar join key |
| `meal_items` | The lines of a meal, each carrying its USDA/OFF match |
| `books`, `saved_meals` | Reading's shelf and Calories' one-tap combinations |
| `writing_projects` | Writing's projects, each with its own measure and target; totals are derived, never stored |
| `goals` | Goals recur, milestones happen once; both surface on the calendar |
| `log_drafts`, `log_draft_rows` | Parsed but unapproved — nothing reaches a module from here without review |
| `connections`, `connection_shares` | Per-module sharing, withdrawable |
| `food_cache` | Nutrition matches, so a repeated meal does not re-hit either database |

Views: `daily_module_totals` (the number the week strip, day list and months
grid read), `published_series` (crosstalk), `entry_feed` (the log, with meal
items folded in), `writing_project_totals`, `my_connections`.

**Two units in one module.** A Writing session is words or minutes, and the
rollup must never add them together. Two nullable columns on `modules` make that
declarative rather than a special case:

- `measure_setting` names a key in `user_modules.settings` that picks the
  headline unit — the number `daily_module_totals.value` reports.
- `series_by_unit` maps units to series names, so Writing publishes
  `writing.words` and `writing.minutes` separately.

`daily_module_measures` holds one row per unit, `daily_module_totals` folds them
into one row per module per day with a `measures` map beside the headline. A day
with only minutes has a null `value` and a non-zero `entry_count`, which is why
both clients test `entry_count` for "did I do this today", not `value`.

Functions that must happen atomically are SQL, not edge functions:
`approve_draft`, `log_meal`, `log_saved_meal`, `save_meal_from_entry`,
`request_connection`, `respond_to_connection`, `set_module_share`.

## Row level security

You own your rows. A connection reads a row only if you granted them that row's
module — `shares_module(owner, viewer, module)` is what every read policy calls,
and revoking a grant takes the data back on the next read.

`scripts/smoke.sql` proves it: it shares Weight with a second account, checks
Calories and Reading stay invisible, then revokes and checks the Weight rows
disappear too.

```bash
./scripts/validate-migrations.sh          # schema only
./scripts/validate-migrations.sh --seed   # schema + demo data
```

That script needs any Postgres you can create databases on — it stubs the parts
of Supabase (the `auth` schema, the `anon`/`authenticated`/`service_role` roles)
the migrations lean on.

## Demo account

`seed.sql` creates `you@trackalack.test` / `trackalack` with thirteen weeks of
weight and calories, two books, the goals and milestones from the designs, three
saved meals, and the Marcus / Priya / Jules connections. "Today" in the data is
2026-09-07, the Monday the screens show.
