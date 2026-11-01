# web — the browser app

React + Vite + TypeScript, talking straight to Supabase. No server of its own;
the server work lives in `../app` as SQL functions and edge functions.

```bash
cp .env.example .env.local     # fill in from `supabase status`
npm install
npm run dev                    # http://localhost:5173
npm run build                  # typecheck + production build
```

## Layout

```
src/
  styles/tokens.css      Modernist, warmed — the single source of colour and type;
                         every highlight shade derives from --color-accent
  styles/app.css         screen furniture: week strip, widget cell, day line, months grid
  lib/                   supabase client, dates, formatting, projection maths,
                         theme (the per-account highlight), nutrition (macros, provenance)
  data/                  api calls, React Query hooks, auth
  modules/registry.ts    what a module is: its mark, its Log label, its day line;
                         activity trackers are registered from the catalog
  modules/goals.ts       recurring goal readouts (milestones are off for now)
  data/series.ts         day rollups → the series widgets and goals read
  components/widgets/    one widget per module, each led by the same input line + Log button
  pages/                 Dashboard, Log, Calendar, ModuleDetail, Settings, SignIn
```

## The dashboard is a widget host

`Dashboard.tsx` reads which modules are active and puts each one's widget, then
each crosstalk chart, into one grid. There are no side panels — no module list,
no goals panel. The count decides the columns:

| Active modules | Layout |
| --- | --- |
| 1–3 | Two columns: three widgets and a chart make a 2×2 |
| 4+ | Compact widgets, three across, charts after them |

The last cell stretches across whatever its row leaves, so the grid never ends
on a hole (two widgets and a chart put the chart full-width underneath).

A crosstalk chart appears when every module it draws on is active — the pairs
are declared in `registry.ts`, and each chart owns neither series it draws.

## Checking the screens without a backend

`tools/preview.mjs` serves the built app, answers its API calls from fixtures in
`tools/fixtures.mjs`, and screenshots every screen — useful for comparing
against the design canvas, and for catching a runtime error before it reaches a
person.

```bash
npm run build
node tools/preview.mjs                       # writes preview/*.png
PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium node tools/preview.mjs
```

Nothing in `tools/` ships in the app.
