# Track-a-Lack

A habit tracker built out of modules. You turn on the ones you want to track;
each brings its own tools, its own dashboard widgets, and its own line on the
calendar. Modules publish named series that other modules and widgets can read,
and the calendar is the spine everything joins on.

Built from the Claude Design handoff in `project/` and `chats/` — the canvas
screens (1a–1i, 2a–2b, 3a–3b) and the conversation that produced them.

```
app/   Supabase — schema, RLS, database functions, edge functions, seed data
web/   React + Vite + TypeScript
ios/   SwiftUI, no package dependencies
```

Each has its own README with setup, and they share one model:

- **Modules describe themselves.** The `modules` table holds the contract — what
  a module publishes, what it subscribes to, whether a day sums or takes the
  last reading. Each client holds the presentation half: the mark, the Log
  label, the one line the module contributes to a calendar day. The dashboard is
  a widget host, not a hand-built page.
- **Crosstalk is read-only published series.** Weight publishes `weight.daily`,
  Calories publishes `calories.daily`. The Weight × Calories chart owns neither
  and subscribes to both.
- **The calendar is the join key.** Every entry is timestamped, so every module
  can render a day summary and the whole app agrees on what "Tuesday" means.
- **Nothing writes to a module without review.** The Log is module-agnostic:
  text in, parsed on the server, typed draft rows out, approved by hand.
- **Sharing is per module.** Granting Weight does not grant Calories, and a
  grant can be withdrawn without dropping the connection.

## Getting it running

```bash
# 1. the backend
cd app && supabase start && supabase db reset

# 2. the web app
cd ../web && cp .env.example .env.local   # fill in from `supabase status`
npm install && npm run dev

# 3. the iOS app
open ../ios/TrackALack.xcodeproj          # set SUPABASE_URL / SUPABASE_ANON_KEY
```

The seed creates `you@trackalack.test` / `trackalack` with thirteen weeks of
data, standing at the numbers the designs show on 2026-09-07.

## Modules

| Module | Records | Publishes |
| --- | --- | --- |
| Weight | A weigh-in, set by dragging rather than typed | `weight.daily` |
| Calories | Meals, priced against USDA FoodData Central and Open Food Facts | `calories.daily`, `calories.meals` |
| Reading | Pages against a book you add, with an optional note | `reading.pages`, `reading.books` |
| Running | Distance and time | `running.miles`, `running.pace` |
| Writing | Words per session | `writing.words` |
| Sleep | Hours | `sleep.hours` |

Weight, Calories and Reading are on for a new account; the rest are opt-in.
Adding a seventh means a row in `modules`, a definition in each client's
registry, and a widget — no changes to the dashboard, the calendar or the log.

## External services

All optional. Without keys the app still runs: log lines fall back to a
deterministic parser, and an unpriced food becomes a "No match — set by hand"
row you can fill in.

- **OpenAI (GPT-5.6 Sol)** parses a log line into typed rows.
- **USDA FoodData Central** and **Open Food Facts** price food. The source order
  is a Calories setting; barcodes always resolve through Open Food Facts.

## What has been verified

- `app/` — every migration applies to a clean Postgres and the smoke test passes,
  covering the new-account trigger, the meal re-sum, book progress, the daily
  rollups, draft approval, and per-module sharing including revocation
  (`./scripts/validate-migrations.sh --seed`). The seed lands on the designed
  numbers exactly.
- `web/` — typechecks and builds; every screen was driven in Chromium against
  fixture data and checked against the canvas (`node tools/preview.mjs`).
- `ios/` — **not compiled.** It was written on Linux, where there is no Xcode.
- The edge functions have not been executed: that needs a Docker daemon for
  `supabase start`, which this environment does not have.
