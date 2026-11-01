// 1f and 3a — the spine.
//
// Days is the default: one row per day, one summary line per module, straight
// from each module's own definition, and beneath them whatever connections
// share with you. Months trades those summaries for density — six months at a
// glance, a stack of bars per day — with each day filling towards the
// highlight as more of its modules are used.

import { useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { MacroBar } from '@/components/Nutrition';
import type { MacroTotals } from '@/lib/nutrition';
import { fillStyle, indexTotals, loggedOn, totalKey } from '@/components/WeekStrip';
import {
  useBooks,
  useConnections,
  useDailyMacros,
  useDailyTotals,
  useDayClosures,
  useGoals,
  useModules,
  useProfile,
  useSharedTotals,
} from '@/data/hooks';
import { dayFill } from '@/data/series';
import {
  addDays,
  dayNumber,
  dowShort,
  fromISODate,
  lastMonths,
  monthGrid,
  monthName,
  today as todayISO,
  toISODate,
} from '@/lib/dates';
import { group } from '@/lib/format';
import { moduleDef, type ModuleDef } from '@/modules/registry';
import type { ModuleSlug, SharedDayTotal } from '@/lib/types';

type View = 'days' | 'months';

export function CalendarPage() {
  const today = todayISO();
  const [view, setView] = useState<View>('days');
  const [filter, setFilter] = useState<ModuleSlug | 'all'>('all');
  const [daysShown, setDaysShown] = useState(30);
  const [showShared, setShowShared] = useState(true);

  const monthsBack = 6;
  const from =
    view === 'days'
      ? addDays(today, -(daysShown - 1))
      : toISODate(new Date(fromISODate(today).getFullYear(), fromISODate(today).getMonth() - (monthsBack - 1), 1));

  const profile = useProfile();
  const modules = useModules();
  const totals = useDailyTotals(from, today);
  const goals = useGoals();
  const books = useBooks();
  const closures = useDayClosures(from, today);
  const connections = useConnections();
  const shared = useSharedTotals(from, today, view === 'days');
  const macros = useDailyMacros(from, today);

  const macrosByDay = useMemo(() => {
    const map = new Map<string, MacroTotals>();
    for (const r of macros.data ?? []) {
      map.set(r.local_date, {
        grams: { protein_g: r.protein_g, carbs_g: r.carbs_g, fat_g: r.fat_g, fiber_g: r.fiber_g },
        known: r.items_with_macros,
        of: r.items,
      });
    }
    return map;
  }, [macros.data]);

  const totalsIndex = useMemo(() => indexTotals(totals.data), [totals.data]);

  const sharedByDay = useMemo(() => {
    const map = new Map<string, SharedDayTotal[]>();
    for (const row of shared.data ?? []) {
      const list = map.get(row.local_date) ?? [];
      list.push(row);
      map.set(row.local_date, list);
    }
    return map;
  }, [shared.data]);

  const names = useMemo(
    () =>
      new Map(
        (connections.data ?? []).map((c) => [c.other_id, c.person?.display_name ?? c.person?.email ?? 'Someone']),
      ),
    [connections.data],
  );

  if (profile.isLoading || modules.isLoading) return <div className="spinner">Loading the calendar…</div>;

  const active = (modules.data ?? []).filter((m) => m.active).sort((a, b) => a.position - b.position);
  const shown = active.filter((m) => filter === 'all' || m.slug === filter);
  const defs = shown.map((m) => moduleDef(m.slug));
  // The fill always measures the whole set, whichever module is filtered to.
  const allDefs = active.map((m) => moduleDef(m.slug));

  const calorieTarget = Number(active.find((m) => m.slug === 'calories')?.settings.daily_target ?? 2200);
  const readingGoal = Number(
    (goals.data ?? []).find((g) => g.module_slug === 'reading' && g.cadence === 'daily')?.target ?? 30,
  );
  const dayCtx = {
    calorieTarget,
    readingGoal,
    bookTitle: books.data?.find((b) => b.status === 'reading')?.title ?? null,
    weightUnit: profile.data?.weight_unit ?? ('lb' as const),
    closedCalorieDays: new Set(
      (closures.data ?? []).filter((c) => c.module_slug === 'calories').map((c) => c.local_date),
    ),
  };

  const hasShared = (shared.data ?? []).length > 0;

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 20px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--color-bg)',
          flexWrap: 'wrap',
        }}
      >
        <h4 style={{ margin: 0, marginRight: 'auto' }}>
          {view === 'days' ? `${monthName(today)} ${today.slice(0, 4)}` : today.slice(0, 4)}
        </h4>

        {view === 'days' && hasShared ? (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
            <input type="checkbox" checked={showShared} onChange={(e) => setShowShared(e.target.checked)} />
            Shared with you
          </label>
        ) : null}

        <div className="seg">
          {(['days', 'months'] as View[]).map((option) => (
            <label className="seg-opt" key={option}>
              <input type="radio" name="calview" checked={view === option} onChange={() => setView(option)} />
              {option === 'days' ? 'Days' : 'Months'}
            </label>
          ))}
        </div>

        <div className="seg">
          <label className="seg-opt">
            <input type="radio" name="calmod" checked={filter === 'all'} onChange={() => setFilter('all')} />
            All modules
          </label>
          {active.map((m) => (
            <label className="seg-opt" key={m.slug}>
              <input type="radio" name="calmod" checked={filter === m.slug} onChange={() => setFilter(m.slug)} />
              {moduleDef(m.slug).name}
            </label>
          ))}
        </div>
      </div>

      {view === 'months' ? (
        <div className="legend">
          <span style={{ opacity: 0.6 }}>
            {defs.length === 1 ? 'One bar per day —' : `${defs.length} bars per day, top to bottom —`}
          </span>
          {defs.map((def) => (
            <span className="lg-mod" key={def.slug}>
              <Icon name={def.icon} />
              {def.name}
            </span>
          ))}
          <span className="lg-key" style={{ marginLeft: 'auto' }}>
            <span className="lg-swatch" style={{ height: 3 }} />
            logged
          </span>
          <span className="lg-key">
            <span className="lg-swatch" style={{ width: 15, height: 10, background: 'color-mix(in srgb, var(--color-accent) 50%, var(--color-bg))' }} />
            fill = share of modules used
          </span>
        </div>
      ) : null}

      {totals.isLoading ? <div className="spinner">Loading days…</div> : null}

      {view === 'days' ? (
        <>
          {Array.from({ length: daysShown }, (_, i) => addDays(today, -i)).map((date) => (
            <DayRow
              key={date}
              date={date}
              today={today}
              defs={defs}
              totals={totalsIndex}
              ctx={dayCtx}
              shared={showShared ? (sharedByDay.get(date) ?? []).filter((r) => filter === 'all' || r.module_slug === filter) : []}
              names={names}
              macros={macrosByDay.get(date) ?? null}
            />
          ))}
          <div style={{ padding: '14px 16px', background: 'var(--color-bg)' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setDaysShown((n) => n + 30)}>
              Load {monthName(addDays(today, -(daysShown + 1)))}
            </button>
          </div>
        </>
      ) : (
        <div className="months">
          {lastMonths(today, monthsBack).map(({ year, month }) => (
            <MonthBlock
              key={`${year}-${month}`}
              year={year}
              month={month}
              today={today}
              defs={defs}
              allDefs={allDefs}
              totals={totalsIndex}
            />
          ))}
        </div>
      )}
    </>
  );
}

/** How a shared day reads: the number on a full grant, a tick on presence. */
function sharedText(row: SharedDayTotal): string {
  const def = moduleDef(row.module_slug);
  if (row.detail === 'presence' || row.value == null) return def.kind === 'activity' ? 'done' : 'logged';
  if (def.kind === 'activity') return 'done';
  return def.daySummary(
    {
      user_id: row.owner_id,
      local_date: row.local_date,
      module_slug: row.module_slug,
      value: row.value,
      unit: row.unit,
      entry_count: row.entry_count,
      last_at: '',
      measures: row.measures,
    },
    { calorieTarget: Infinity, readingGoal: Infinity, bookTitle: null, weightUnit: (row.unit as 'lb' | 'kg') ?? 'lb' },
  ).text;
}

function DayRow({
  date,
  today,
  defs,
  totals,
  ctx,
  shared,
  names,
  macros,
}: {
  date: string;
  today: string;
  defs: ModuleDef[];
  totals: ReturnType<typeof indexTotals>;
  ctx: Parameters<ModuleDef['daySummary']>[1];
  shared: SharedDayTotal[];
  names: Map<string, string>;
  /** The day's macros, for the mini bar under the calorie bar. */
  macros: MacroTotals | null;
}) {
  const isToday = date === today;

  return (
    <div className={isToday ? 'dl today' : 'dl'}>
      <div className="dl-date">
        <div className="dow" style={isToday ? { color: 'var(--color-accent-700)', opacity: 1 } : undefined}>
          {dowShort(date)}
        </div>
        <div className="dnum">{dayNumber(date)}</div>
        {isToday ? <div style={{ fontSize: 10, opacity: 0.5, marginTop: 2 }}>Today</div> : null}
      </div>

      <div className="dl-body">
        {defs.map((def) => {
          const summary = def.daySummary(totals.get(totalKey(date, def.slug)), ctx);
          return (
            <div className="sumrow" key={def.slug}>
              <span className="sum-mod">
                <Icon name={def.icon} />
                {def.name}
              </span>
              {summary.text === 'not logged' ? (
                <span style={{ opacity: 0.4 }}>not logged</span>
              ) : (
                <b>{summary.text}</b>
              )}
              {summary.bar ? (
                <span className="sum-bars">
                  <span className="sum-bar">
                    <span className={summary.bar.over ? 'over' : undefined} style={{ width: `${summary.bar.pct}%` }} />
                  </span>
                  {/* The macros, on the calorie bar's scale, 3px beneath it. */}
                  {def.slug === 'calories' && macros?.known ? (
                    <MacroBar totals={macros} target={ctx.calorieTarget} height={3} showKey={false} />
                  ) : null}
                </span>
              ) : null}
              {summary.note ? (
                <span className="sum-note" style={summary.over ? { color: 'var(--color-accent-700)' } : { opacity: 0.5 }}>
                  {summary.note}
                </span>
              ) : null}
            </div>
          );
        })}

        {shared.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 2, paddingTop: 6, borderTop: '1px dashed var(--line)', fontSize: 12 }}>
            {shared.map((row) => {
              const def = moduleDef(row.module_slug);
              return (
                <span
                  key={`${row.owner_id}-${row.module_slug}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  title={row.detail === 'presence' ? 'Shared as logged / not logged only' : undefined}
                >
                  <span style={{ opacity: 0.6 }}>{names.get(row.owner_id) ?? 'Connection'}</span>
                  <Icon name={def.icon} />
                  <b style={{ fontWeight: 800 }}>{sharedText(row)}</b>
                  {row.detail === 'full' && row.module_slug === 'calories' && row.value != null ? (
                    <span style={{ opacity: 0.5 }}>kcal</span>
                  ) : null}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MonthBlock({
  year,
  month,
  today,
  defs,
  allDefs,
  totals,
}: {
  year: number;
  month: number;
  today: string;
  defs: ModuleDef[];
  allDefs: ModuleDef[];
  totals: ReturnType<typeof indexTotals>;
}) {
  const cells = monthGrid(year, month);
  const dates = cells.filter((c): c is string => c !== null);
  const logged = dates.filter((date) => defs.some((def) => loggedOn(totals, date, def)));
  const bySlug = new Map(allDefs.map((d) => [d.slug, d]));

  return (
    <div>
      <div className="month-head">
        <h4>{monthName(toISODate(new Date(year, month, 1)))}</h4>
        <span>
          {logged.length} of {dates.length} days
        </span>
      </div>
      <div className="month-dow">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="month-grid">
        {cells.map((date, i) => {
          if (date === null) return <div className="mday blank" key={`blank-${i}`} />;
          const fraction = date > today ? 0 : dayFill(date, [...bySlug.keys()], (d, slug) => loggedOn(totals, d, bySlug.get(slug)!));
          const { style, full } = fillStyle(fraction);
          const used = Math.round(fraction * allDefs.length);
          return (
            <div
              className={['mday', date === today ? 'today' : '', full ? 'full' : ''].filter(Boolean).join(' ')}
              key={date}
              style={style}
              title={`${date} — ${group(used)} of ${allDefs.length} modules`}
            >
              <div className="mday-num">{dayNumber(date)}</div>
              <div className="mday-bars">
                {defs.map((def) => (
                  <span key={def.slug} className={loggedOn(totals, date, def) ? 'on' : undefined} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
