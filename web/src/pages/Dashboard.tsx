// 1a — the modular grid. The dashboard is a widget host: it reads which modules
// are active, drops each one's widget into an equal-width cell, and lets the
// count decide the layout. Two modules get room to breathe, five fall back to
// the compact variant in a 3-up grid; nothing here is written per module.

import { useMemo } from 'react';
import { CrosstalkChart } from '@/components/CrosstalkChart';
import { GoalsPanel, ModulesPanel } from '@/components/Panels';
import { StripLegend, WeekStrip, indexTotals } from '@/components/WeekStrip';
import { WIDGETS } from '@/components/widgets';
import {
  useBooks,
  useDailyTotals,
  useEntries,
  useGoals,
  useModules,
  useProfile,
  useSavedMeals,
  useWritingProjects,
} from '@/data/hooks';
import { buildSeriesIndex } from '@/data/series';
import { addDays, rangeOfDays, startOfWeek, today as todayISO, weekDays, weekLabel } from '@/lib/dates';
import { group } from '@/lib/format';
import { mean, movingMean, type Point } from '@/lib/projection';
import { readGoal, upcoming } from '@/modules/goals';
import { CROSSTALK, moduleDef, publisherOf } from '@/modules/registry';
import type { Goal, ModuleSlug } from '@/lib/types';

const HISTORY_DAYS = 90;

export function Dashboard() {
  const today = todayISO();
  const from = addDays(today, -(HISTORY_DAYS - 1));

  const profile = useProfile();
  const modules = useModules();
  const totals = useDailyTotals(from, today);
  const entries = useEntries(today, today);
  const goals = useGoals();
  const books = useBooks();
  const savedMeals = useSavedMeals();
  const writingProjects = useWritingProjects();

  const totalsIndex = useMemo(() => indexTotals(totals.data), [totals.data]);
  const series = useMemo(() => buildSeriesIndex(totals.data), [totals.data]);
  const seriesFor = series.byModule;

  if (profile.isLoading || modules.isLoading || totals.isLoading) {
    return <div className="spinner">Loading your week…</div>;
  }
  if (!profile.data) return <div className="error">Could not load your profile.</div>;

  const active = (modules.data ?? []).filter((m) => m.active).sort((a, b) => a.position - b.position);
  const defs = active.map((m) => moduleDef(m.slug));
  const count = active.length;
  const compact = count >= 4;
  // Two modules get a cell each; three make room for the Today panel as a
  // fourth; four or more fall back to a 3-up grid of compact widgets.
  const columns = count >= 4 ? 3 : count === 3 ? 4 : Math.max(count, 1);

  const days = weekDays(startOfWeek(today));
  const activeGoals = (goals.data ?? []).filter((g) => active.some((m) => m.slug === g.module_slug));
  const goalCtx = { seriesFor, seriesByName: series.byName, books: books.data ?? [], today };
  // Recurring goals first, with the last slot kept for the nearest milestone —
  // the panel is meant to answer "how is today going, and what is close".
  const slots = compact ? 4 : 3;
  const recurring = activeGoals.filter((g) => g.kind === 'goal' && !g.due_on);
  const milestones = activeGoals
    .filter((g) => g.kind === 'milestone' && !g.achieved_at)
    .sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999'));
  const readouts = [...recurring.slice(0, slots - Math.min(milestones.length, 1)), ...milestones.slice(0, 1)]
    .slice(0, slots)
    .map((g) => readGoal(g, goalCtx));
  const ahead = upcoming(activeGoals, goalCtx, 3);

  const widgetProps = {
    compact,
    today,
    totals: totalsIndex,
    entries: entries.data ?? [],
    goals: goals.data ?? [],
    profile: profile.data,
    books: books.data ?? [],
    savedMeals: savedMeals.data ?? [],
    writingProjects: writingProjects.data ?? [],
  };

  // The panel takes whatever the widgets leave, so the grid never ends on a
  // hole — five cells across three columns is four widgets and a wide panel.
  const cells = count + 1;
  const overhang = cells % columns;
  const panelSpan = overhang === 0 ? 1 : columns - overhang + 1;

  const goalsPanel = (
    <GoalsPanel
      key="goals"
      title={count <= 3 ? 'Today' : 'Goals & milestones'}
      icon={count <= 3 ? 'target' : null}
      readouts={readouts}
      ahead={ahead}
      compact={compact}
      span={panelSpan}
    />
  );

  const charts = CROSSTALK.filter((c) => c.requires.every((slug) => active.some((m) => m.slug === slug)));

  return (
    <>
      <div className="row-between pad" style={{ paddingBottom: 10 }}>
        <h4 style={{ margin: 0 }}>{weekLabel(startOfWeek(today))}</h4>
        <span style={{ fontSize: 11.5, opacity: 0.55 }}>
          {count} module{count === 1 ? '' : 's'} active
          {count <= 3 ? ` · ${defs.map((d) => d.name).join(', ')}` : ' · compact widgets'}
        </span>
      </div>

      <WeekStrip days={days} today={today} modules={defs} totals={totalsIndex} />
      <StripLegend modules={defs} />

      <div className="wgrid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {active.map((m) => {
          const Widget = WIDGETS[m.slug as ModuleSlug];
          return <Widget key={m.slug} {...widgetProps} settings={m.settings} series={seriesFor(m.slug)} />;
        })}
        {/* At one or two modules the panel has room beside the chart instead. */}
        {count >= 3 ? goalsPanel : null}
      </div>

      {charts.length ? (
        <div
          className="wgrid"
          style={{
            gridTemplateColumns:
              charts.length > 1
                ? 'repeat(2, minmax(0, 1fr))'
                : count === 3
                  ? '2fr 1fr'
                  : count < 3
                    ? 'minmax(0, 1fr) 300px'
                    : 'minmax(0, 1fr)',
          }}
        >
          {charts.map((chart) => (
            <ChartCell
              key={chart.id}
              chart={chart}
              today={today}
              seriesFor={seriesFor}
              goals={activeGoals}
              calorieTarget={Number(
                active.find((m) => m.slug === 'calories')?.settings.daily_target ?? 2200,
              )}
            />
          ))}
          {charts.length === 1 && count === 3 ? <ModulesPanel modules={modules.data ?? []} /> : null}
          {charts.length === 1 && count < 3 ? goalsPanelAside(readouts, ahead) : null}
        </div>
      ) : null}
    </>
  );
}

function goalsPanelAside(readouts: ReturnType<typeof readGoal>[], ahead: ReturnType<typeof upcoming>) {
  return <GoalsPanel title="Goals & milestones" readouts={readouts} ahead={ahead} />;
}

function ChartCell({
  chart,
  today,
  seriesFor,
  goals,
  calorieTarget,
}: {
  chart: (typeof CROSSTALK)[number];
  today: string;
  seriesFor: (slug: string) => Point[];
  goals: Goal[];
  calorieTarget: number;
}) {
  const barModule = publisherOf(chart.bars);
  const lineModule = publisherOf(chart.line);
  const window = 30;
  const domain = rangeOfDays(today, window);

  const bars = (barModule ? seriesFor(barModule.slug) : []).slice(-window);
  const rawLine = (lineModule ? seriesFor(lineModule.slug) : []).slice(-window);
  // Weight reads as a 7-day mean; a mileage line is drawn as logged.
  const line = lineModule?.slug === 'weight' ? movingMean(rawLine, 7) : rawLine;

  const milestone = goals.find(
    (g) => g.kind === 'milestone' && g.module_slug === lineModule?.slug && g.target !== null,
  );
  const barMean = mean(bars);

  return (
    <div className="wg">
      <div className="wg-head">
        <span className="kick">
          <svg className="mi" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 3v16a2 2 0 0 0 2 2h16" />
            <path d="m19 9-5 5-4-4-3 3" />
          </svg>
          {chart.title}
        </span>
        <span className="tag tag-outline">{window} days</span>
      </div>

      <CrosstalkChart
        ariaLabel={`${chart.title} over ${window} days`}
        domain={domain}
        bars={bars}
        barLabel={chart.bars}
        barTarget={chart.bars === 'calories.daily' ? calorieTarget : null}
        barTargetLabel={`${group(calorieTarget)} target`}
        line={line}
        lineLabel={lineModule?.slug === 'weight' ? `${chart.line}, 7-day mean` : chart.line}
        lineDashed={chart.lineDashed}
        goal={milestone ? { target: Number(milestone.target), label: milestone.title } : null}
        footnote={
          chart.footnote ?? (barMean !== null ? `Mean ${group(barMean)} kcal` : undefined)
        }
      />
    </div>
  );
}
