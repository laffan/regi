# Regi

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
- **A module may record more than one unit.** Writing counts a session in words
  or in minutes; the two are separate series and are never added together. The
  module names a setting that picks which one leads on the calendar, and the
  day rollup carries both.
- **The calendar is the join key.** Every entry is timestamped, so every module
  can render a day summary and the whole app agrees on what "Tuesday" means.
- **Nothing writes to a module without review.** The Log is module-agnostic:
  text in, parsed on the server, typed draft rows out, approved by hand.
- **Sharing is per module, in both directions.** For each module you choose
  what a connection gets — nothing, only whether you logged that day, or the
  full detail — and for each module they share you choose whether to see it.
  A grant can be changed or withdrawn without dropping the connection.
- **Every calorie says where it came from.** An item records its source
  (USDA, Open Food Facts, an OpenAI estimate, or set by hand), what it was
  matched to, and the arithmetic behind the number.

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
| Weight | A weigh-in, typed into the widget's input line | `weight.daily` |
| Calories | Food with protein, carbs, fibre and fat, priced against USDA FoodData Central, Open Food Facts and (labelled as estimates) OpenAI | `calories.daily`, `calories.meals` |
| Reading | Pages against a book you add, with an optional note | `reading.pages`, `reading.books` |
| Running | Distance and time | `running.miles`, `running.pace` |
| Writing | Sessions against a project, in words **or** minutes | `writing.words`, `writing.minutes`, `writing.projects` |
| Sleep | Hours | `sleep.hours` |

Weight, Calories and Reading are on for a new account; the rest are opt-in.
Adding a seventh built-in means a row in `modules`, a definition in each
client's registry, and a widget — no changes to the dashboard, the calendar or
the log.

**Activity trackers** are modules people make for themselves (Settings →
Modules → Track Activity): a name, an icon from the Lucide set, and a daily
"I did!" / "Not today" switch. They live in `modules` with an owner, publish
`activity.<slug>`, and appear everywhere a built-in does. The icon's geometry
is stored with the tracker, so a client can draw it without the icon library.

Clicking an earlier day in the dashboard's week strip switches the page to
that day ("Adding to Wednesday, October 28"): the widgets show it, and anything
logged from them lands on it. Clicking it again, or today, returns to the week.

Saved combinations (one-tap food) are made from a logged entry's Edit panel,
choosing which of its items to keep, and remember the entry they came from;
hovering a combination's calorie figure turns it into a delete control.

On the dashboard every module leads with the same control — an input line with
its "Log …" button attached — and its numbers sit beneath. A food line sent from
the Calories widget goes straight to the Log, where it shows as a placeholder
draft until its items have been looked up.

Each day in the week strip and the months grid fills towards the highlight
colour by the share of active modules used that day; the colour is a per-account
setting (Settings → Appearance, cornflower by default).

Goals recur ("under 2,200 daily"). Milestones and the "Coming up" list are
switched off for now — the `goals` table still holds milestone rows, the
clients just do not ask for them.

Writing is the one that keeps projects: a novel counted in words, morning pages
counted in minutes, each with its own target. A session belongs to a project and
is measured in either unit, whatever the project usually uses.

## External services

All optional. Without keys the app still runs: log lines fall back to a
deterministic parser, an unpriced food becomes a "No match — set by hand"
row you can fill in, and the microphone button reports that voice logging is
not configured.

- **OpenAI** parses a log line into typed rows (GPT-5.6 Sol by default),
  estimates energy and macros for foods the databases do not know (always
  labelled "OpenAI estimate", with the portion it assumed), and transcribes
  voice logging (`gpt-transcribe` by default). A transcript lands in the input
  line for review; it is never parsed or saved without you.
- **USDA FoodData Central** and **Open Food Facts** price food, energy and
  macros. The order of the three sources, and whether OpenAI is asked at all,
  is a Calories setting; barcodes always resolve through Open Food Facts.

## What has been verified

- `app/` — every migration applies to a clean Postgres and the smoke test passes,
  covering the new-account trigger, the meal re-sum, book progress, the daily
  rollups, draft approval, and per-module sharing including revocation
  (`./scripts/validate-migrations.sh --seed`). The seed lands on the designed
  numbers exactly.
- `web/` — typechecks and builds; every screen was driven in Chromium against
  fixture data and checked against the canvas (`node tools/preview.mjs`),
  including the edit dialog, the tracker dialog, Appearance and the two-way
  sharing controls.
- `ios/` — **not compiled.** It was written on Linux, where there is no Xcode.
  It has been kept working against the current schema (trackers, the new food
  source, recurring goals only, the cornflower highlight and the day fill), but
  editing entries, voice logging, macros, the per-account colour, tracker
  icons, Track Activity, the sharing levels and the input-first widgets are
  web-only so far.
- The edge functions typecheck against a Deno shim but have not been executed:
  that needs a Docker daemon for `supabase start`, and no OpenAI, USDA or Open
  Food Facts call has been made from this environment.
