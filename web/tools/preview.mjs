// Offline preview: serves the built app, answers its API calls from fixtures,
// and screenshots each screen. Lets the layout be checked against the design
// canvas without a Supabase project running.
//
//   npm run build && node tools/preview.mjs [outDir]
//
// Every response here is fixture data — nothing in this file runs in the app.

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fx from './fixtures.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const outDir = process.argv[2] ?? join(root, 'preview');
const PORT = 4321;
const SUPABASE_HOST = '127.0.0.1:54321';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

// ── a static server for dist/, with SPA fallback ────────────────────────────
const server = createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  let file = join(dist, path === '/' ? 'index.html' : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    const body = await readFile(join(dist, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(body);
  }
});

// ── fixtures, shaped the way PostgREST answers ──────────────────────────────
const totals = fx.dailyTotals();

function between(rows, url, field = 'local_date') {
  const gte = url.searchParams.get(field)?.startsWith('gte.') ? url.searchParams.get(field).slice(4) : null;
  const params = url.searchParams.getAll(field);
  let from = null;
  let to = null;
  for (const p of params) {
    if (p.startsWith('gte.')) from = p.slice(4);
    if (p.startsWith('lte.')) to = p.slice(4);
  }
  from = from ?? gte;
  return rows.filter((r) => (!from || r[field] >= from) && (!to || r[field] <= to));
}

function tableFor(url, activeSlugs) {
  const table = url.pathname.split('/rest/v1/')[1] ?? '';

  switch (table) {
    case 'profiles': {
      const idFilter = url.searchParams.get('id');
      if (idFilter?.startsWith('in.')) return fx.people;
      return [fx.profile];
    }
    case 'modules':
      return fx.modules;
    case 'user_modules':
      return fx.userModules(activeSlugs);
    case 'daily_module_totals':
      return between(totals, url);
    case 'entry_feed':
      return between(fx.entries, url);
    case 'published_series': {
      const series = url.searchParams.get('series')?.slice(3);
      const module = fx.modules.find((m) => m.primary_series === series);
      return between(totals, url)
        .filter((r) => r.module_slug === module?.slug)
        .map((r) => ({ local_date: r.local_date, value: r.value, unit: r.unit, module_slug: r.module_slug }));
    }
    case 'books':
      return fx.books;
    case 'saved_meals':
      return fx.savedMeals;
    case 'goals': {
      const kind = url.searchParams.get('kind')?.slice(3);
      return kind ? fx.goals.filter((g) => g.kind === kind) : fx.goals;
    }
    case 'day_closures':
      return fx.dayClosures;
    case 'log_drafts':
      return [fx.draft];
    case 'log_draft_rows':
      return fx.draftRows;
    case 'writing_projects':
      return fx.writingProjects;
    case 'writing_project_totals':
      return fx.writingProjectTotals;
    case 'my_connections':
      return fx.connections;
    default:
      return [];
  }
}

async function shoot(page, name, path, click, wait = 900, run) {
  await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(wait);
  for (const target of [].concat(click ?? [])) {
    await page.getByText(target, { exact: true }).first().click();
    await page.waitForTimeout(500);
  }
  if (run) {
    await run(page);
    await page.waitForTimeout(600);
  }
  await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: true });
}

const scenarios = [
  { name: '1a-dashboard-3-modules', path: '/', active: ['weight', 'calories', 'reading'] },
  { name: '2a-dashboard-2-modules', path: '/', active: ['weight', 'calories'] },
  { name: '2b-dashboard-5-modules', path: '/', active: ['weight', 'calories', 'reading', 'running', 'writing'] },
  { name: '1d-log', path: '/log', active: ['weight', 'calories', 'reading'] },
  { name: '1f-calendar-days', path: '/calendar', active: ['weight', 'calories', 'reading'] },
  { name: '3a-calendar-months', path: '/calendar', active: ['weight', 'calories', 'reading'], click: 'Months' },
  { name: '1h-module-calories', path: '/module/calories', active: ['weight', 'calories', 'reading'] },
  {
    name: 'writing-dashboard',
    path: '/',
    active: ['weight', 'calories', 'reading', 'writing'],
  },
  {
    name: 'writing-module',
    path: '/module/writing',
    active: ['weight', 'calories', 'reading', 'writing'],
  },
  { name: '1i-settings-sharing', path: '/settings/sharing', active: ['weight', 'calories', 'reading'] },
  // The first feedback round.
  { name: 'fb-dashboard-tracker', path: '/', active: ['weight', 'calories', 'reading', 'act-water'] },
  { name: 'fb-log-edit-meal', path: '/log', active: ['weight', 'calories', 'reading'], click: 'Edit' },
  { name: 'fb-settings-appearance', path: '/settings/appearance', active: ['weight', 'calories', 'reading'] },
  { name: 'fb-settings-modules', path: '/settings/modules', active: ['weight', 'calories', 'reading', 'writing', 'act-water'] },
  { name: 'fb-track-activity', path: '/settings/modules', active: ['weight', 'calories', 'reading'], click: 'Track Activity' },
  { name: 'fb-sharing-edit', path: '/settings/sharing', active: ['weight', 'calories', 'reading'], click: 'Edit' },
  { name: 'fb-calendar-shared', path: '/calendar', active: ['weight', 'calories', 'reading', 'act-water'] },
  { name: 'fb-calendar-months', path: '/calendar', active: ['weight', 'calories', 'reading', 'act-water'], click: 'Months' },
  { name: 'fb-module-tracker', path: '/module/act-water', active: ['weight', 'calories', 'reading', 'act-water'] },
  // Second round: a food line sent from the dashboard lands on the Log as a
  // placeholder draft while the (deliberately slow) parse runs.
  {
    name: 'fb2-log-placeholder',
    path: '/',
    active: ['weight', 'calories', 'reading', 'running', 'sleep'],
    run: async (page) => {
      await page.getByLabel('What did you eat?').fill('two eggs and a slice of toast');
      await page.getByRole('button', { name: 'Log food' }).click();
      await page.waitForURL('**/log');
    },
  },
  // Third round.
  {
    name: 'fb3-dashboard-picked-day',
    path: '/',
    active: ['weight', 'calories', 'reading'],
    run: async (page) => {
      await page.locator('.wk > button').nth(2).click();
      await page.locator('.chip-group').first().hover();
    },
  },
  {
    name: 'fb3-save-combination',
    path: '/log',
    active: ['weight', 'calories', 'reading'],
    run: async (page) => {
      await page.getByRole('button', { name: /^Edit Yogurt/ }).click();
      await page.getByRole('button', { name: 'Add as Saved Combination' }).click();
    },
  },
  {
    name: 'fb2-log-filter',
    path: '/log',
    active: ['weight', 'calories', 'reading'],
    run: async (page) => {
      await page.getByLabel('Filter the log by module').selectOption('calories');
    },
  },
];

const consoleErrors = [];

await new Promise((resolve) => server.listen(PORT, resolve));

// PLAYWRIGHT_CHROMIUM_PATH lets a machine with a pre-installed browser skip
// `npx playwright install`.
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
);
const context = await browser.newContext({ viewport: { width: 1320, height: 1100 }, deviceScaleFactor: 2 });

// A session in storage, so the app renders signed in.
await context.addInitScript(() => {
  const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
  const session = {
    access_token: 'preview-token',
    token_type: 'bearer',
    expires_in: 86400,
    expires_at: expires,
    refresh_token: 'preview-refresh',
    user: {
      id: 'a0000000-0000-4000-8000-000000000001',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'you@trackalack.test',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-06-01T00:00:00Z',
    },
  };
  localStorage.setItem('sb-127-auth-token', JSON.stringify(session));
});

let activeSlugs = ['weight', 'calories', 'reading'];

await context.route(`**://${SUPABASE_HOST}/**`, async (route) => {
  const url = new URL(route.request().url());
  const accept = route.request().headers()['accept'] ?? '';
  const single = accept.includes('vnd.pgrst.object');

  if (url.pathname.startsWith('/auth/v1/user')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: fx.profile.id, email: fx.profile.email, aud: 'authenticated', role: 'authenticated' }),
    });
  }

  // parse-log answers slowly, so the placeholder draft can be seen.
  if (url.pathname.startsWith('/functions/v1/parse-log')) {
    await new Promise((r) => setTimeout(r, 8000));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ draft: null, rows: [] }) });
  }

  if (url.pathname.startsWith('/rest/v1/rpc/')) {
    const fn = url.pathname.split('/rpc/')[1];
    const body =
      fn === 'shared_daily_totals' ? fx.sharedTotals() : fn === 'schema_version' ? fx.SCHEMA_VERSION : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  }

  if (url.pathname.startsWith('/rest/v1/')) {
    const rows = tableFor(url, activeSlugs);
    return route.fulfill({
      status: 200,
      contentType: single ? 'application/vnd.pgrst.object+json' : 'application/json',
      body: JSON.stringify(single ? (rows[0] ?? null) : rows),
    });
  }

  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});

const page = await context.newPage();
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

for (const scenario of scenarios) {
  activeSlugs = scenario.active;
  await shoot(page, scenario.name, scenario.path, scenario.click, 900, scenario.run);
  console.log(`✓ ${scenario.name}`);
}

await browser.close();
server.close();

if (consoleErrors.length) {
  console.log('\nconsole errors:');
  for (const line of [...new Set(consoleErrors)]) console.log(' •', line);
  process.exitCode = 1;
} else {
  console.log('\nno console errors');
}
