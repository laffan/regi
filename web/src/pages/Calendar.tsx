// 1f and 3a — the spine.
//
// Days is the default: one row per day, one summary line per module, straight
// from each module's own definition. Months trades those summaries for density
// — six months at a glance, a stack of bars per day — and both views carry
// goals and milestones, including ones still ahead.

import { useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { indexTotals, totalKey } from '@/components/WeekStrip';
import { useBooks, useDailyTotals, useGoals, useModules, useProfile } from '@/data/hooks';
import {
  addDays,
  dayNumber,
  dowShort,
  fromISODate,
  lastMonths,
  monthGrid,
  monthName,
  shortDate,
  today as todayISO,
  toISODate,
} from '@/lib/dates';
import { flaggedDates, nearestMilestone, upcoming, type DayFlag } from '@/modules/goals';
import { moduleDef } from '@/modules/registry';
import type { DailyTotal, ModuleSlug } from '@/lib/types';
import type { Point } from '@/lib/projection';

type View = 'days' | 'months';

export function CalendarPage() {
  const today = todayISO();
  const [view, setView] = useState<View>('days');
  const [filter, setFilter] = useState<ModuleSlug | 'all'>('all');
  const [daysShown, setDaysShown] = useState(30);

  const monthsBack = 6;
  const from = view === 'days' ? addDays(today, -(daysShown - 1)) : toISODate(new Date(fromISODate(today).getFullYear(), fromISODate(today).getMonth() - (monthsBack - 1), 1));

  const profile = useProfile();
  const modules = useModules();
  const totals = useDailyTotals(from, today);
  const goals = useGoals();
  const books = useBooks();

  const totalsIndex = useMemo(() => indexTotals(totals.data), [totals.data]);
  const seriesFor = useMemo(() => {
    const bySlug = new Map<string, Point[]>();
    for (const row of (totals.data ?? []) as DailyTotal[]) {
      if (row.value === null) continue;
      const list = bySlug.get(row.module_slug) ?? [];
      list.push({ date: row.local_date, value: Number(row.value) });
      bySlug.set(row.module_slug, list);
    }
    for (const list of bySlug.values()) list.sort((a, b) => a.date.localeCompare(b.date));
    return (slug: string) => bySlug.get(slug) ?? [];
  }, [totals.data]);

  if (profile.isLoading || modules.isLoading) return <div className="spinner">Loading the calendar…</div>;

  const active = (modules.data ?? []).filter((m) => m.active).sort((a, b) => a.position - b.position);
  const shown = active.filter((m) => filter === 'all' || m.slug === filter);
  const defs = shown.map((m) => moduleDef(m.slug));

  const activeGoals = (goals.data ?? []).filter((g) => shown.some((m) => m.slug === g.module_slug));
  const ahead = upcoming(activeGoals, { seriesFor, books: books.data ?? [], today }, 4);
  const flags = flaggedDates(activeGoals);
  const nearest = nearestMilestone(activeGoals, { seriesFor, books: books.data ?? [], today });

  const calorieTarget = Number(active.find((m) => m.slug === 'calories')?.settings.daily_target ?? 2200);
  const readingGoal = Number(
    activeGoals.find((g) => g.module_slug === 'reading' && g.cadence === 'daily')?.target ?? 30,
  );
  const dayCtx = {
    calorieTarget,
    readingGoal,
    bookTitle: books.data?.find((b) => b.status === 'reading')?.title ?? null,
    weightUnit: profile.data?.weight_unit ?? ('lb' as const),
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--line)', background: 'var(--color-bg)', flexWrap: 'wrap' }}>
        <h4 style={{ margin: 0, marginRight: 'auto' }}>
          {view === 'days' ? `${monthName(today)} ${today.slice(0, 4)}` : today.slice(0, 4)}
        </h4>

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
              <input
                type="radio"
                name="calmod"
                checked={filter === m.slug}
                onChange={() => setFilter(m.slug as ModuleSlug)}
              />
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
            <span className="lg-swatch off" style={{ height: 3 }} />
            none
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--color-accent-700)' }}>
            <Icon name="flag" />
            goal or milestone
          </span>
        </div>
      ) : null}

      {ahead.length ? (
        <div className="ahead">
          <div className="ahead-label">
            <Icon name="flag" />
            Ahead
          </div>
          <div className="ahead-items">
            {ahead.map((item) => (
              <span key={`${item.date}-${item.label}`}>
                <Icon name={moduleDef(item.moduleSlug).icon} />
                <b>{shortDate(item.date)}</b> {item.label}
              </span>
            ))}
          </div>
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
              flag={flags.get(date) ?? null}
              todayMilestone={date === today ? nearest : null}
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
              totals={totalsIndex}
              flags={flags}
            />
          ))}
        </div>
      )}
    </>
  );
}

function DayRow({
  date,
  today,
  defs,
  totals,
  ctx,
  flag,
  todayMilestone,
}: {
  date: string;
  today: string;
  defs: ReturnType<typeof moduleDef>[];
  totals: ReturnType<typeof indexTotals>;
  ctx: Parameters<ReturnType<typeof moduleDef>['daySummary']>[1];
  flag: DayFlag | null;
  todayMilestone: string | null;
}) {
  const isToday = date === today;

  return (
    <div className={isToday ? 'dl today' : 'dl'}>
      <div className="dl-date">
        <div className="dow" style={isToday ? { color: 'var(--color-accent)', opacity: 1 } : undefined}>
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
                <span className="sum-bar">
                  <span className={summary.bar.over ? 'over' : undefined} style={{ width: `${summary.bar.pct}%` }} />
                </span>
              ) : null}
              {summary.note ? (
                <span style={summary.over ? { color: 'var(--color-accent-700)' } : { opacity: 0.5 }}>
                  {summary.note}
                </span>
              ) : null}
            </div>
          );
        })}

        {flag || todayMilestone ? (
          <div style={{ display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
            {flag ? (
              <span className={flag.achieved ? 'tag tag-neutral' : 'tag tag-accent'}>
                {flag.achieved ? 'Reached · ' : 'Milestone · '}
                {flag.label}
              </span>
            ) : null}
            {todayMilestone ? <span className="tag tag-accent">Milestone · {todayMilestone}</span> : null}
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
  totals,
  flags,
}: {
  year: number;
  month: number;
  today: string;
  defs: ReturnType<typeof moduleDef>[];
  totals: ReturnType<typeof indexTotals>;
  flags: Map<string, DayFlag>;
}) {
  const cells = monthGrid(year, month);
  const dates = cells.filter((c): c is string => c !== null);
  const logged = dates.filter((date) => defs.some((def) => totals.get(totalKey(date, def.slug))?.value != null));

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
        {cells.map((date, i) =>
          date === null ? (
            <div className="mday blank" key={`blank-${i}`} />
          ) : (
            <div
              className={
                date === today ? 'mday today' : flags.has(date) ? 'mday marked' : 'mday'
              }
              key={date}
              title={flags.get(date)?.label ?? date}
            >
              <div className="mday-num">{dayNumber(date)}</div>
              {flags.has(date) ? (
                <div className="mday-flag">
                  <Icon name="flag" />
                </div>
              ) : null}
              <div className="mday-bars">
                {defs.map((def) => (
                  <span
                    key={def.slug}
                    className={totals.get(totalKey(date, def.slug))?.value != null ? 'on' : undefined}
                  />
                ))}
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
