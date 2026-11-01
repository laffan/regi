// Turning the day rollups into the series widgets and goals read.
//
// Most modules publish one series, so the day's `value` is it. A module that
// records more than one unit — Writing, in words and minutes — publishes one
// series per unit, and those come out of the `measures` map rather than the
// headline number.

import type { Point } from '@/lib/projection';
import type { DailyTotal } from '@/lib/types';
import { moduleDef } from '@/modules/registry';

export interface SeriesIndex {
  /** The module's headline series, e.g. weight.daily. */
  byModule: (slug: string) => Point[];
  /** A named series, e.g. writing.minutes. */
  byName: (series: string) => Point[];
}

export function buildSeriesIndex(totals: DailyTotal[] | undefined): SeriesIndex {
  const bySeries = new Map<string, Point[]>();

  const push = (series: string, date: string, value: number) => {
    const list = bySeries.get(series) ?? [];
    list.push({ date, value });
    bySeries.set(series, list);
  };

  for (const row of totals ?? []) {
    const def = moduleDef(row.module_slug);

    if (def.seriesByUnit) {
      for (const [unit, series] of Object.entries(def.seriesByUnit)) {
        const value = row.measures?.[unit];
        if (value != null) push(series, row.local_date, Number(value));
      }
    } else if (row.value != null) {
      push(def.primarySeries, row.local_date, Number(row.value));
    }
  }

  for (const list of bySeries.values()) list.sort((a, b) => a.date.localeCompare(b.date));

  const byName = (series: string) => bySeries.get(series) ?? [];

  return {
    byName,
    byModule: (slug: string) => {
      const def = moduleDef(slug);
      // For a multi-unit module the headline series follows the unit the
      // rollup led with, which is the user's own setting.
      if (def.seriesByUnit) {
        const rows = (totals ?? []).filter((row) => row.module_slug === slug);
        const unit = rows.find((row) => row.unit)?.unit;
        const named = unit ? def.seriesByUnit[unit] : undefined;
        if (named) return byName(named);
      }
      return byName(def.primarySeries);
    },
  };
}

/** A day counts as logged if anything was recorded, whatever unit it was in. */
export function isLogged(total: Pick<DailyTotal, 'value' | 'entry_count'> | undefined): boolean {
  if (!total) return false;
  return total.value != null || (total.entry_count ?? 0) > 0;
}

/** How much of the day's set was used: 1 of 3 active modules logged is a third. */
export function dayFill(date: string, slugs: string[], logged: (date: string, slug: string) => boolean): number {
  if (!slugs.length) return 0;
  return slugs.filter((slug) => logged(date, slug)).length / slugs.length;
}
