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
  styles/tokens.css      Modernist, warmed — the single source of colour and type
  styles/app.css         screen furniture: week strip, widget cell, day line, months grid
  lib/                   supabase client, dates, formatting, the projection maths
  data/                  api calls, React Query hooks, auth
  modules/registry.ts    what a module is: its mark, its Log label, its day line
  modules/goals.ts       goal readouts, the Coming up list, calendar flags
  data/series.ts         day rollups → the series widgets and goals read
  components/widgets/    one widget per module, all ending in the same Log control
  pages/                 Dashboard, Log, Calendar, ModuleDetail, Settings, SignIn
```

## The dashboard is a widget host

`Dashboard.tsx` reads which modules are active and drops each one's widget into
an equal-width cell. The count decides the layout, matching the canvas:

| Active modules | Layout |
| --- | --- |
| 1–2 | A cell each; the goals panel sits beside the crosstalk chart |
| 3 | Three widgets plus the Today panel, four across |
| 4+ | Compact widgets in a 3-up grid, goals as the last cell, charts two across |

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
