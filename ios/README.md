# ios — the iPhone app

SwiftUI, no package dependencies. Open `TrackALack.xcodeproj` and run.

```
TrackALack/
  TrackALackApp.swift      app entry, tab shell, screen header
  Design/                  Modernist tokens; the module marks
  Support/                 dates, formatting, the projection maths
  Models/                  the API rows
  Data/                    Supabase client, keychain, the store
  Modules/                 the module registry and goal readouts
  Views/                   dashboard, log, calendar, module detail, settings
```

## Pointing it at a backend

Either edit `Data/Config.swift`, or set them per scheme (Product → Scheme → Edit
Scheme → Run → Arguments → Environment Variables), which is easier when moving
between a local stack and a hosted project:

```
SUPABASE_URL       http://127.0.0.1:54321
SUPABASE_ANON_KEY  <from `supabase status`>
```

The simulator reaches a local Supabase on `127.0.0.1`; a device on the same
network needs the Mac's LAN address instead.

Sign in with the seeded account — `you@trackalack.test` / `trackalack`.

## What is in here

- **Dashboard (1c)** — the week strip with its legend, then a stacked widget per
  active module, the goals panel, and the crosstalk charts. The screen is a
  widget host: it reads which modules are active and drops each one's cell in.
- **Log (1e)** — today's entries, the review block over the keyboard, the input
  row under the thumb. Text goes to `parse-log`; nothing reaches a module until
  Approve.
- **Calendar (1g, 3b)** — Days is one card per day with a summary line per
  module; Months is six months of three-bar days. Both open with the Ahead band.
- **Module detail (1h)** — the chart, today's entries, goals and milestones, the
  API panel, and for Calories the saved meals and source order. Writing adds its
  projects and the headline-measure switch.
- **Settings** — Sharing (per-module grants, connections by login email),
  Modules, Account.

## Two deliberate choices

**No Swift package dependencies.** The Supabase client is ~250 lines of
URLSession in `Data/Supabase.swift` covering auth, PostgREST, RPC and edge
functions. It keeps the project opening and building with nothing to resolve; if
the surface grows, `supabase-swift` drops in behind the same call sites. The
session is stored in the keychain, not UserDefaults.

**The module marks are drawn from the design's own path data.** Rather than
approximate them with SF Symbols, `Design/VectorIcon.swift` reads the same SVG
path strings the web app uses, on the same 24×24 grid at the same 1.8 stroke.
One source of geometry, two platforms drawing it.

## Fonts

The designs are set in Archivo. Without it bundled the app falls back to the
system face, which changes the texture but not the layout. To match exactly, add
`Archivo-Regular.ttf`, `Archivo-SemiBold.ttf` and `Archivo-ExtraBold.ttf` to the
target and list them under `UIAppFonts` — `Theme.font(_:_:)` picks them up on its
own.

## Not yet verified

This app was written on Linux, where there is no Xcode: **it has not been
compiled or run**. Expect to fix a few things on first build — the project file
uses Xcode 16's synchronized folders (`fileSystemSynchronizedGroups`), so adding
or renaming sources needs no project edits, and the deployment target is iOS
17.0.
