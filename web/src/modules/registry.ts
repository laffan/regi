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

import type { IconName } from '@/components/Icon';
import type { DailyTotal, ModuleRow, ModuleSlug } from '@/lib/types';
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
  icon: IconName;
  unit: string;
  valueKind: 'last' | 'sum';
  primarySeries: string;
  publishes: string[];
  subscribes: string[];
  logLabel: string;
  /** What this module contributes to one day of the calendar. */
  daySummary: (day: DailyTotal | undefined, ctx: DayContext) => DaySummary;
}

export interface DayContext {
  calorieTarget: number;
  readingGoal: number;
  bookTitle: string | null;
  weightUnit: 'lb' | 'kg';
}

const notLogged: DaySummary = { text: 'not logged' };

export const MODULES: Record<ModuleSlug, ModuleDef> = {
  weight: {
    slug: 'weight',
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
    name: 'Calories',
    icon: 'utensils',
    unit: 'kcal',
    valueKind: 'sum',
    primarySeries: 'calories.daily',
    publishes: ['calories.daily', 'calories.meals'],
    subscribes: ['weight.daily'],
    logLabel: 'Log meal',
    daySummary: (day, ctx) => {
      if (day?.value == null) return notLogged;
      const over = day.value > ctx.calorieTarget;
      return {
        text: group(day.value),
        bar: { pct: Math.min(day.value / ctx.calorieTarget, 1) * 100, over },
        note: over
          ? `over by ${group(day.value - ctx.calorieTarget)}`
          : `${day.entry_count} meal${day.entry_count === 1 ? '' : 's'}`,
        over,
      };
    },
  },

  reading: {
    slug: 'reading',
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
    name: 'Writing',
    icon: 'pencil',
    unit: 'words',
    valueKind: 'sum',
    primarySeries: 'writing.words',
    publishes: ['writing.words'],
    subscribes: [],
    logLabel: 'Log session',
    daySummary: (day) => (day?.value == null ? notLogged : { text: `${group(day.value)} words` }),
  },

  sleep: {
    slug: 'sleep',
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

export const MODULE_ORDER: ModuleSlug[] = ['weight', 'calories', 'reading', 'running', 'writing', 'sleep'];

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
  return MODULES[slug as ModuleSlug] ?? MODULES.weight;
}

/** Crosstalk: which modules can read a given series. */
export function subscribersOf(series: string): ModuleDef[] {
  return MODULE_ORDER.map((s) => MODULES[s]).filter((m) => m.subscribes.includes(series));
}

export function publisherOf(series: string): ModuleDef | undefined {
  return MODULE_ORDER.map((s) => MODULES[s]).find((m) => m.publishes.includes(series));
}

/** Development-only guard against this file and the catalog table drifting. */
export function assertCatalogMatches(rows: ModuleRow[]): void {
  if (!import.meta.env.DEV) return;

  for (const row of rows) {
    const def = MODULES[row.slug];
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
