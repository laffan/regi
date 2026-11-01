// Modules describe themselves.
//
// The database holds the contract half of a module — what it publishes, what it
// subscribes to, how a day rolls up. This file holds the presentation half:
// its mark, its Log control's wording, and the one line it contributes to a
// calendar day. The dashboard is a widget host that reads both; activating a
// module adds its widgets in place, and nothing about the page is hand-built
// per module.
//
// `assertCatalogMatches` shouts in development if the two halves drift.

import type { CustomIcon, IconName } from '@/components/Icon';
import type { BuiltinSlug, DailyTotal, ModuleRow, ModuleSlug } from '@/lib/types';
import { group, weight } from '@/lib/format';

export interface DaySummary {
  /** Left column: the value, e.g. "182.4 lb", "1,480", "24 pages". */
  text: string;
  /** Optional rule drawn beside it, as a fraction of the day's target. */
  bar?: { pct: number; over: boolean };
  /** Trailing note: "3 meals", "The Overstory", "over by 210". */
  note?: string;
  over?: boolean;
}

export interface ModuleDef {
  slug: ModuleSlug;
  name: string;
  icon: IconName | CustomIcon;
  /** "activity" for a tracker a person made: one yes/no a day. */
  kind: 'builtin' | 'activity';
  unit: string;
  valueKind: 'last' | 'sum';
  primarySeries: string;
  publishes: string[];
  subscribes: string[];
  logLabel: string;
  /**
   * Unit → series, for a module that records more than one measure. Writing
   * counts a session in words or in minutes, and the two are never added
   * together: they are separate series, and the user's `measure` setting picks
   * which one leads on the calendar.
   */
  seriesByUnit?: Record<string, string>;
  /** How each unit reads in a summary line. */
  unitLabels?: Record<string, string>;
  /** What this module contributes to one day of the calendar. */
  daySummary: (day: DailyTotal | undefined, ctx: DayContext) => DaySummary;
}

export interface DayContext {
  calorieTarget: number;
  readingGoal: number;
  bookTitle: string | null;
  weightUnit: 'lb' | 'kg';
  /** Days whose Calories count was closed with "Last meal of the day". */
  closedCalorieDays?: Set<string>;
}

const notLogged: DaySummary = { text: 'not logged' };

/** "640 words", "25 min" — one string per unit actually recorded that day. */
function measureParts(day: DailyTotal | undefined): string[] {
  const measures = day?.measures ?? (day?.value != null && day.unit ? { [day.unit]: day.value } : null);
  if (!measures) return [];

  const labels = MODULES.writing.unitLabels ?? {};
  return Object.entries(measures)
    .filter(([, value]) => value != null)
    .sort(([a], [b]) => (a === 'words' ? -1 : b === 'words' ? 1 : a.localeCompare(b)))
    .map(([unit, value]) => `${group(Number(value))} ${labels[unit] ?? unit}`);
}

export const MODULES: Record<BuiltinSlug, ModuleDef> = {
  weight: {
    slug: 'weight',
    kind: 'builtin',
    name: 'Weight',
    icon: 'scale',
    unit: 'lb',
    valueKind: 'last',
    primarySeries: 'weight.daily',
    publishes: ['weight.daily'],
    subscribes: [],
    logLabel: 'Log weight',
    daySummary: (day, ctx) =>
      day?.value == null ? notLogged : { text: `${weight(day.value)} ${day.unit ?? ctx.weightUnit}` },
  },

  calories: {
    slug: 'calories',
    kind: 'builtin',
    name: 'Calories',
    icon: 'utensils',
    unit: 'kcal',
    valueKind: 'sum',
    primarySeries: 'calories.daily',
    publishes: ['calories.daily', 'calories.meals'],
    subscribes: ['weight.daily'],
    logLabel: 'Log food',
    daySummary: (day, ctx) => {
      if (day?.value == null) return notLogged;
      const over = day.value > ctx.calorieTarget;
      const closed = ctx.closedCalorieDays?.has(day.local_date);
      return {
        text: group(day.value),
        bar: { pct: Math.min(day.value / ctx.calorieTarget, 1) * 100, over },
        note: over
          ? `over by ${group(day.value - ctx.calorieTarget)}${closed ? ' · day closed' : ''}`
          : closed
            ? `${group(ctx.calorieTarget - day.value)} under · day closed`
            : `${day.entry_count} ${day.entry_count === 1 ? 'entry' : 'entries'}`,
        over,
      };
    },
  },

  reading: {
    slug: 'reading',
    kind: 'builtin',
    name: 'Reading',
    icon: 'book-open',
    unit: 'pages',
    valueKind: 'sum',
    primarySeries: 'reading.pages',
    publishes: ['reading.pages', 'reading.books'],
    subscribes: [],
    logLabel: 'Log pages',
    daySummary: (day, ctx) => {
      if (day?.value == null) return notLogged;
      return {
        text: `${group(day.value)} pages`,
        note: day.value >= ctx.readingGoal ? 'goal met' : ctx.bookTitle ?? undefined,
      };
    },
  },

  running: {
    slug: 'running',
    kind: 'builtin',
    name: 'Running',
    icon: 'run',
    unit: 'mi',
    valueKind: 'sum',
    primarySeries: 'running.miles',
    publishes: ['running.miles', 'running.pace'],
    subscribes: [],
    logLabel: 'Log run',
    daySummary: (day) =>
      day?.value == null ? notLogged : { text: `${day.value.toFixed(1)} ${day.unit ?? 'mi'}` },
  },

  writing: {
    slug: 'writing',
    kind: 'builtin',
    name: 'Writing',
    icon: 'pencil',
    unit: 'words',
    valueKind: 'sum',
    primarySeries: 'writing.words',
    publishes: ['writing.words', 'writing.minutes', 'writing.projects'],
    subscribes: [],
    logLabel: 'Log session',
    seriesByUnit: { words: 'writing.words', min: 'writing.minutes' },
    unitLabels: { words: 'words', min: 'min' },
    daySummary: (day) => {
      // A session is measured in words or in minutes, so the line reports
      // whichever were recorded rather than one number that means neither.
      const parts = measureParts(day);
      if (!parts.length) return notLogged;
      return { text: parts[0], note: parts[1] };
    },
  },

  sleep: {
    slug: 'sleep',
    kind: 'builtin',
    name: 'Sleep',
    icon: 'bell',
    unit: 'h',
    valueKind: 'sum',
    primarySeries: 'sleep.hours',
    publishes: ['sleep.hours'],
    subscribes: [],
    logLabel: 'Log sleep',
    daySummary: (day) => (day?.value == null ? notLogged : { text: `${day.value.toFixed(1)} h` }),
  },
};

export const MODULE_ORDER: BuiltinSlug[] = ['weight', 'calories', 'reading', 'running', 'writing', 'sleep'];

// ── activity trackers ───────────────────────────────────────────────────────
// A person's own modules arrive with the catalog; their definitions are built
// here from the row, so every surface that asks moduleDef() gets one.

const custom = new Map<string, ModuleDef>();

export function activityDef(row: Pick<ModuleRow, 'slug' | 'name' | 'icon' | 'icon_nodes' | 'primary_series'>): ModuleDef {
  return {
    slug: row.slug,
    kind: 'activity',
    name: row.name,
    icon: row.icon_nodes?.length ? { name: row.icon, nodes: row.icon_nodes } : 'activity',
    unit: 'done',
    valueKind: 'last',
    primarySeries: row.primary_series,
    publishes: [row.primary_series],
    subscribes: [],
    logLabel: 'I did!',
    daySummary: (day) => (day && (day.value ?? 0) > 0 ? { text: 'done' } : notLogged),
  };
}

/** Called whenever the catalog loads, so trackers resolve like built-ins. */
export function registerModules(rows: ModuleRow[]): void {
  custom.clear();
  for (const row of rows) {
    if (row.kind === 'activity') custom.set(row.slug, activityDef(row));
  }
}

const unknownModule = (slug: string): ModuleDef => ({
  ...activityDef({ slug, name: 'Module', icon: 'activity', icon_nodes: null, primary_series: slug }),
  name: 'Unavailable module',
});

export function isBuiltin(slug: string): slug is BuiltinSlug {
  return slug in MODULES;
}

function allDefs(): ModuleDef[] {
  return [...MODULE_ORDER.map((s) => MODULES[s]), ...custom.values()];
}

/**
 * Crosstalk widgets. Each one reads two published series and owns neither —
 * that is the whole point of the pattern, and why adding a pair here needs no
 * change to either module. A chart appears when every module it draws on is
 * active.
 */
export interface CrosstalkDef {
  id: string;
  title: string;
  bars: string;
  line: string;
  lineDashed?: boolean;
  requires: ModuleSlug[];
  footnote?: string;
}

export const CROSSTALK: CrosstalkDef[] = [
  {
    id: 'weight-x-calories',
    title: 'Weight × Calories',
    bars: 'calories.daily',
    line: 'weight.daily',
    requires: ['weight', 'calories'],
  },
  {
    id: 'running-x-calories',
    title: 'Running × Calories',
    bars: 'calories.daily',
    line: 'running.miles',
    lineDashed: true,
    requires: ['running', 'calories'],
    footnote: 'Intake tracks mileage within a day',
  },
];

export function moduleDef(slug: string): ModuleDef {
  return (isBuiltin(slug) ? MODULES[slug] : custom.get(slug)) ?? unknownModule(slug);
}

/** Crosstalk: which modules can read a given series. */
export function subscribersOf(series: string): ModuleDef[] {
  return allDefs().filter((m) => m.subscribes.includes(series));
}

export function publisherOf(series: string): ModuleDef | undefined {
  return allDefs().find((m) => m.publishes.includes(series));
}

/** Development-only guard against this file and the catalog table drifting. */
export function assertCatalogMatches(rows: ModuleRow[]): void {
  if (!import.meta.env.DEV) return;

  for (const row of rows) {
    if (row.kind === 'activity') continue;
    const def = isBuiltin(row.slug) ? MODULES[row.slug] : undefined;
    if (!def) {
      console.warn(`[modules] "${row.slug}" is in the catalog but has no client definition.`);
      continue;
    }
    const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
    if (!same(def.publishes, row.publishes) || !same(def.subscribes, row.subscribes)) {
      console.warn(
        `[modules] "${row.slug}" contract drift — catalog publishes ${row.publishes.join(', ')} / ` +
          `subscribes ${row.subscribes.join(', ')}; client says ${def.publishes.join(', ')} / ${def.subscribes.join(', ')}.`,
      );
    }
  }
}
