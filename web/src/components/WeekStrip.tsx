import { Icon } from './Icon';
import { isLogged } from '@/data/series';
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

interface Props {
  days: string[];
  today: string;
  modules: ModuleDef[];
  totals: TotalsIndex;
  onSelect?: (date: string) => void;
  compact?: boolean;
}

/** One bar per active module, filled on the days that module was logged. */
export function WeekStrip({ days, today, modules, totals, onSelect, compact }: Props) {
  return (
    <div className="wk">
      {days.map((date) => {
        const isToday = date === today;
        const cell = (
          <>
            <div className="dow" style={compact ? { fontSize: 9 } : undefined}>
              {compact ? dowShort(date)[0] : dowShort(date)}
            </div>
            <div className="dnum" style={compact ? { fontSize: 20 } : undefined}>
              {dayNumber(date)}
            </div>
            <div className="mrow">
              {modules.map((m) => (
                <span
                  key={m.slug}
                  className={isLogged(totals.get(totalKey(date, m.slug))) ? 'mdot on' : 'mdot'}
                />
              ))}
            </div>
          </>
        );

        return onSelect ? (
          <button
            key={date}
            type="button"
            className={isToday ? 'today' : undefined}
            onClick={() => onSelect(date)}
            aria-label={`${dowShort(date)} ${dayNumber(date)}`}
          >
            {cell}
          </button>
        ) : (
          <div key={date} className={isToday ? 'today' : undefined}>
            {cell}
          </div>
        );
      })}
    </div>
  );
}

/** The key the strip needs to be readable: which bar is which module. */
export function StripLegend({ modules, thick = true }: { modules: ModuleDef[]; thick?: boolean }) {
  return (
    <div className="legend">
      <span style={{ opacity: 0.6 }}>One bar per module —</span>
      {modules.map((m) => (
        <span key={m.slug} className="lg-mod">
          <Icon name={m.icon} />
          {m.name}
        </span>
      ))}
      <span className="lg-key" style={{ marginLeft: 'auto' }}>
        <span className="lg-swatch" style={{ height: thick ? 5 : 3 }} />
        logged
      </span>
      <span className="lg-key">
        <span className="lg-swatch off" style={{ height: thick ? 5 : 3 }} />
        none
      </span>
    </div>
  );
}
