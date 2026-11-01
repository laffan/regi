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
    food-lookup/         one food priced by every enabled source, with provenance;
                         or a phrase split into priced items (the meal editor's Add Item)
    transcribe/          voice logging: speech in, text out (nothing is saved)
    _shared/             the client, the parsers, the food matching, OpenAI
scripts/
  validate-migrations.sh applies every migration to a throwaway Postgres
  smoke.sql              triggers, rollups, drafts and per-module sharing
```

## Running it

```bash
supabase start                 # local stack (needs Docker)
supabase db reset              # migrations + seed.sql
supabase functions serve       # parse-log, food-lookup and transcribe
```

`supabase status` prints the API URL and anon key the clients need.

For a hosted project: `supabase link --project-ref <ref>` then `supabase db push`
and `supabase functions deploy parse-log food-lookup transcribe`.

## Secrets

The edge functions read these; all are optional and the app degrades rather
than breaks without them.

| Variable | Used for | Without it |
| --- | --- | --- |
| `OPENAI_API_KEY` | Parsing a log line, estimating foods the databases miss, voice logging | A rule-based parser handles the line; unmatched food is set by hand; the mic reports it is not configured |
| `OPENAI_MODEL` | Which model parses (default `gpt-5.6-sol`) | The default |
| `OPENAI_NUTRITION_MODEL` | Which model estimates energy and macros (default: `OPENAI_MODEL`) | The default |
| `OPENAI_TRANSCRIBE_MODEL` | Which model transcribes speech (default `gpt-transcribe`) | The default |
| `USDA_FDC_API_KEY` | USDA FoodData Central matches ([key](https://fdc.nal.usda.gov/api-key-signup.html)) | Open Food Facts (and OpenAI, if enabled) only |

Open Food Facts needs no key. Set them with
`supabase secrets set OPENAI_API_KEY=… USDA_FDC_API_KEY=…`, or in
`supabase/.env` for local serving.

## The shape of the data

`entries` is the spine: every module writes timestamped rows into it, which is
what lets the calendar render a day summary per module without knowing what any
module is.

| Table | What it holds |
| --- | --- |
| `modules` | The catalog: what each module publishes, subscribes to, and how a day rolls up. Built-ins are seeded; activity trackers carry an `owner_id` and are written only through `create_/update_/delete_activity_module` |
| `user_modules` | Activation and per-module settings (the Calories source order and daily target, Writing's headline unit) |
| `entries` | Every logged thing, with `local_date` as the calendar join key |
| `meal_items` | The lines of a meal: energy, protein/carbs/fat/fibre, the source, what it matched (`matched_name`) and how the number was reached (`basis`) |
| `day_closures` | A module day marked complete — Calories' "Last meal of the day" |
| `books`, `saved_meals` | Reading's shelf and Calories' one-tap combinations |
| `writing_projects` | Writing's projects, each with its own measure and target; totals are derived, never stored |
| `goals` | Goals recur, milestones happen once. Clients currently read only `kind = 'goal'` |
| `log_drafts`, `log_draft_rows` | Parsed but unapproved — nothing reaches a module from here without review |
| `connections`, `connection_shares` | Per-module sharing at a `detail` level — `full` or `presence` — withdrawable |
| `connection_mutes` | Modules a connection shares that the viewer has chosen not to see |
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
`approve_draft`, `log_meal`, `update_meal`, `log_saved_meal`,
`save_meal_from_entry`, `request_connection`, `respond_to_connection`,
`set_module_share_level` (and the older `set_module_share`), `set_receive`,
`set_time_zone`, and the tracker functions.

**Schema version.** `schema_version()` returns the newest migration the web
client depends on. The client compares it with `EXPECTED_SCHEMA` in
`web/src/lib/schema.ts` and shows a banner when the database is behind, because
an unmigrated database fails quietly: the original `approve_draft` drops an
item's macros and provenance. Bump both together in any migration the client
relies on.

**Time zones.** `local_date` is worked out in `profiles.time_zone`. Accounts
start on `UTC`; the web client reports the device's zone on sign-in through
`set_time_zone`, which re-dates existing entries only when the account was
still on that untouched default. `insert_meal_items` is the one place item columns
are written, so logging, approving and editing cannot drift apart.

## Row level security

You own your rows. A connection reads a row only if you granted them that row's
module at full detail — `shares_module(owner, viewer, module)` is what every
read policy calls, and revoking a grant takes the data back on the next read.
A presence-only grant gives no row access at all: `shared_daily_totals(from,
to)` is the one way in, returning that a day was logged with the value, unit
and measures left null, and leaving out anything the viewer has muted.

RLS also lets shared rows through to the viewer's own queries, so both clients
filter their own reads by `user_id`; shared data appears only where it is
meant to (the calendar's "Shared with you" lines).

`scripts/smoke.sql` proves it: it shares Weight with a second account, checks
Calories and Reading stay invisible, then revokes and checks the Weight rows
disappear too. It also shares Calories at presence level and checks no row or
number leaks, mutes it from the receiving side, and creates, logs, shares and
removes an activity tracker.

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
