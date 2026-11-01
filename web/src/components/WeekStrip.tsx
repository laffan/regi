import type { CSSProperties } from 'react';
import { dayFill, isLogged } from '@/data/series';
import { dayNumber, dowShort } from '@/lib/dates';
import type { ModuleDef } from '@/modules/registry';
import type { DailyTotal } from '@/lib/types';

export type TotalsIndex = Map<string, DailyTotal>;

export const totalKey = (date: string, slug: string) => `${date}|${slug}`;

export function indexTotals(rows: DailyTotal[] | undefined): TotalsIndex {
  const index: TotalsIndex = new Map();
  for (const row of rows ?? []) index.set(totalKey(row.local_date, row.module_slug), row);
  return index;
}

/** Logged, by the module's own measure: a tracker counts only a day it was done. */
export function loggedOn(totals: TotalsIndex, date: string, def: Pick<ModuleDef, 'slug' | 'kind'>): boolean {
  const total = totals.get(totalKey(date, def.slug));
  return def.kind === 'activity' ? (total?.value ?? 0) > 0 : isLogged(total);
}

/**
 * The day's fill as CSS: the highlight at the share of active modules used
 * that day. Past about 60% the text switches to the on-highlight colour.
 */
export function fillStyle(fraction: number): { style: CSSProperties; full: boolean } {
  const pct = Math.round(fraction * 100);
  return { style: { ['--fill' as string]: `${pct}%` }, full: pct >= 60 };
}

interface Props {
  days: string[];
  today: string;
  modules: ModuleDef[];
  totals: TotalsIndex;
  onSelect?: (date: string) => void;
  compact?: boolean;
}

/**
 * One bar per active module, filled on the days that module was logged — and
 * the cell itself filling towards the highlight as more of the set is used.
 */
export function WeekStrip({ days, today, modules, totals, onSelect, compact }: Props) {
  return (
    <div className="wk">
      {days.map((date) => {
        const isToday = date === today;
        const fraction = dayFill(date, modules.map((m) => m.slug), (d, slug) =>
          loggedOn(totals, d, modules.find((m) => m.slug === slug)!),
        );
        const { style, full } = fillStyle(fraction);
        const className = [isToday ? 'today' : '', full ? 'full' : ''].filter(Boolean).join(' ') || undefined;
        const used = Math.round(fraction * modules.length);
        const label = `${dowShort(date)} ${dayNumber(date)} — ${used} of ${modules.length} modules logged`;

        const cell = (
          <>
            <div className="dow" style={compact ? { fontSize: 9 } : undefined}>
              {isToday ? 'Today' : compact ? dowShort(date)[0] : dowShort(date)}
            </div>
            <div className="dnum" style={compact ? { fontSize: 20 } : undefined}>
              {dayNumber(date)}
            </div>
            <div className="mrow">
              {modules.map((m) => (
                <span
                  key={m.slug}
                  className={loggedOn(totals, date, m) ? 'mdot on' : 'mdot'}
                  title={m.name}
                />
              ))}
            </div>
          </>
        );

        return onSelect ? (
          <button
            key={date}
            type="button"
            className={className}
            style={style}
            onClick={() => onSelect(date)}
            aria-label={label}
          >
            {cell}
          </button>
        ) : (
          <div key={date} className={className} style={style} title={label}>
            {cell}
          </div>
        );
      })}
    </div>
  );
}
