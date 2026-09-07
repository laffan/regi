// 1h — a module drilled in from its widget.
//
// The page is the same for every module: its chart, its entries, its goals and
// milestones, and the API panel that says what it publishes and what it reads.
// Calories adds the two panels only it has — saved meals and the food sources.

import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { CrosstalkChart } from '@/components/CrosstalkChart';
import {
  useAddGoal,
  useBooks,
  useDailyTotals,
  useEntries,
  useGoals,
  useLogSavedMeal,
  useModules,
  useProfile,
  useSavedMeals,
  useSetModuleActive,
  useSetModuleSettings,
} from '@/data/hooks';
import { addDays, rangeOfDays, timeOfDay, today as todayISO } from '@/lib/dates';
import { group, moduleValue } from '@/lib/format';
import { mean, movingMean, type Point } from '@/lib/projection';
import { readGoal } from '@/modules/goals';
import { CROSSTALK, moduleDef, MODULES, publisherOf, subscribersOf } from '@/modules/registry';
import type { DailyTotal, FoodSource, MealItem, ModuleSlug } from '@/lib/types';

const RANGES = [14, 30, 90] as const;

export function ModuleDetail() {
  const { slug = 'calories' } = useParams();
  const navigate = useNavigate();
  const today = todayISO();
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);

  const def = moduleDef(slug);
  const profile = useProfile();
  const modules = useModules();
  const totals = useDailyTotals(addDays(today, -89), today);
  const entries = useEntries(today, today);
  const goals = useGoals();
  const books = useBooks();
  const savedMeals = useSavedMeals();
  const setActive = useSetModuleActive();
  const setSettings = useSetModuleSettings();
  const quickAdd = useLogSavedMeal();
  const addGoal = useAddGoal();

  const seriesFor = useMemo(() => {
    const bySlug = new Map<string, Point[]>();
    for (const row of (totals.data ?? []) as DailyTotal[]) {
      if (row.value === null) continue;
      const list = bySlug.get(row.module_slug) ?? [];
      list.push({ date: row.local_date, value: Number(row.value) });
      bySlug.set(row.module_slug, list);
    }
    for (const list of bySlug.values()) list.sort((a, b) => a.date.localeCompare(b.date));
    return (s: string) => bySlug.get(s) ?? [];
  }, [totals.data]);

  if (modules.isLoading || profile.isLoading) return <div className="spinner">Loading module…</div>;

  const state = (modules.data ?? []).find((m) => m.slug === slug);
  const isCalories = slug === 'calories';
  const sourceOrder = (state?.settings.source_order as FoodSource[] | undefined) ?? ['usda', 'off'];
  const calorieTarget = Number(state?.settings.daily_target ?? 2200);

  // The detail chart is the crosstalk pair this module takes part in, if there
  // is one; otherwise its own series against itself.
  const pair = CROSSTALK.find((c) => c.requires.includes(slug as ModuleSlug));
  const barModule = pair ? publisherOf(pair.bars) : def;
  const lineModule = pair ? publisherOf(pair.line) : def;

  const bars = (barModule ? seriesFor(barModule.slug) : []).slice(-range);
  const rawLine = (lineModule ? seriesFor(lineModule.slug) : []).slice(-range);
  const line = lineModule?.slug === 'weight' ? movingMean(rawLine, 7) : rawLine;

  const moduleGoals = (goals.data ?? []).filter((g) => g.module_slug === slug);
  const goalCtx = { seriesFor, books: books.data ?? [], today };
  // The marker belongs to whichever module draws the line — inside Calories,
  // that is the Weight milestone the trend is heading for, not a calorie one.
  const milestone = (goals.data ?? []).find(
    (g) => g.kind === 'milestone' && g.module_slug === lineModule?.slug && g.target !== null,
  );
  const todayEntries = (entries.data ?? []).filter((e) => e.module_slug === slug);
  const barMean = mean(bars);

  return (
    <>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'flex-end', gap: 16, background: 'var(--color-bg)' }}>
        <div>
          <Link className="btn btn-ghost" to="/" style={{ paddingLeft: 0 }}>
            ← Dashboard
          </Link>
          <h2 style={{ margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name={def.icon} size={22} />
            {def.name}
          </h2>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={state?.active ? 'tag tag-accent' : 'tag tag-neutral'}>
            {state?.active ? 'Active' : 'Off'}
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={setActive.isPending}
            onClick={() =>
              setActive.mutate(
                { slug: slug as ModuleSlug, active: !state?.active },
                { onSuccess: () => (state?.active ? navigate('/') : undefined) },
              )
            }
          >
            {state?.active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px' }}>
        <div style={{ borderRight: '1px solid var(--line)', background: 'var(--color-bg)' }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--line)' }}>
            <div className="row-between">
              <h4 style={{ margin: 0 }}>{pair ? pair.title : `${def.name} over time`}</h4>
              <div className="seg">
                {RANGES.map((r) => (
                  <label className="seg-opt" key={r}>
                    <input type="radio" name="rng" checked={range === r} onChange={() => setRange(r)} />
                    {r} d
                  </label>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <CrosstalkChart
                ariaLabel={`${def.name} over ${range} days`}
                domain={rangeOfDays(today, range)}
                bars={bars}
                barLabel={barModule?.primarySeries ?? def.primarySeries}
                barTarget={isCalories ? calorieTarget : null}
                barTargetLabel={`${group(calorieTarget)} target`}
                line={line}
                lineLabel={
                  lineModule && lineModule.slug !== slug
                    ? `${lineModule.primarySeries} (from ${lineModule.name})`
                    : def.primarySeries
                }
                lineDashed={pair?.lineDashed}
                goal={milestone ? { target: Number(milestone.target), label: milestone.title } : null}
                height={220}
                footnote={barMean !== null ? `Mean ${group(barMean)} ${barModule?.unit ?? ''}` : undefined}
              />
            </div>
          </div>

          <div style={{ padding: '18px 20px' }}>
            <div className="row-between">
              <h4 style={{ margin: 0 }}>{isCalories ? "Today's meals" : `Today's ${def.name.toLowerCase()}`}</h4>
              <Link className="btn btn-primary" to={isCalories ? '/log' : '/'}>
                {def.logLabel}
              </Link>
            </div>

            {isCalories ? (
              <table className="table" style={{ marginTop: 8 }}>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Food</th>
                    <th>Portion</th>
                    <th>Matched to</th>
                    <th style={{ textAlign: 'right' }}>kcal</th>
                  </tr>
                </thead>
                <tbody>
                  {todayEntries.flatMap((entry) =>
                    ((entry.items ?? []) as MealItem[]).map((item, i) => (
                      <tr key={`${entry.id}-${i}`}>
                        <td style={{ opacity: 0.6 }}>{timeOfDay(entry.occurred_at)}</td>
                        <td>{item.name}</td>
                        <td>{item.portion ?? '—'}</td>
                        <td>
                          {item.match_source === 'manual' || !item.match_ref ? (
                            <span className="tag tag-outline">No match — set by hand</span>
                          ) : (
                            <span className="tag tag-neutral">
                              {item.match_source === 'usda' ? 'USDA' : 'OFF'} {item.match_ref}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 800 }}>{group(item.kcal ?? 0)}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            ) : (
              <table className="table" style={{ marginTop: 8 }}>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Entry</th>
                    <th style={{ textAlign: 'right' }}>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {todayEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td style={{ opacity: 0.6 }}>{timeOfDay(entry.occurred_at)}</td>
                      <td>
                        {entry.label}
                        {entry.note ? <div style={{ fontSize: 11.5, opacity: 0.55 }}>{entry.note}</div> : null}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800 }}>
                        {moduleValue(entry.module_slug, entry.value, entry.unit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {todayEntries.length === 0 ? <div className="empty">Nothing logged today.</div> : null}
          </div>
        </div>

        {/* right rail */}
        <div style={{ background: 'var(--warm)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--line)' }}>
            <div className="kick">Goals</div>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {moduleGoals
                .filter((g) => g.kind === 'goal')
                .map((goal) => {
                  const readout = readGoal(goal, goalCtx);
                  return (
                    <div key={goal.id}>
                      <div style={{ font: "800 13.5px 'Archivo'" }}>{goal.title}</div>
                      <div style={{ fontSize: 11.5, opacity: 0.6 }}>{readout.progress}</div>
                    </div>
                  );
                })}
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-block"
              disabled={addGoal.isPending}
              onClick={() => {
                const title = window.prompt('New goal, e.g. "Under 2,200 kcal daily"');
                if (!title) return;
                const target = window.prompt('Target number (optional)');
                addGoal.mutate({
                  module_slug: slug as ModuleSlug,
                  kind: 'goal',
                  title,
                  series: def.primarySeries,
                  target: target ? Number(target) : null,
                  comparator: target ? '<=' : null,
                  cadence: 'daily',
                });
              }}
            >
              + New goal
            </button>
          </div>

          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--line)' }}>
            <div className="kick">Milestones</div>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {moduleGoals.filter((g) => g.kind === 'milestone').length === 0 ? (
                <span style={{ fontSize: 12, opacity: 0.6 }}>None set.</span>
              ) : null}
              {moduleGoals
                .filter((g) => g.kind === 'milestone')
                .map((goal) => {
                  const readout = readGoal(goal, goalCtx);
                  return (
                    <div key={goal.id}>
                      <div style={{ font: "800 13.5px 'Archivo'" }}>{goal.title}</div>
                      <div style={{ fontSize: 11.5, opacity: 0.6 }}>{readout.progress}</div>
                    </div>
                  );
                })}
            </div>
          </div>

          {isCalories ? (
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--line)' }}>
              <div className="kickn">
                <Icon name="bookmark" />
                Saved meals
              </div>
              <div style={{ marginTop: 8 }}>
                {(savedMeals.data ?? []).map((meal) => (
                  <div
                    key={meal.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '9px 0',
                      borderBottom: '1px solid var(--line)',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: "800 13px 'Archivo'" }}>{meal.name}</div>
                      <div style={{ fontSize: 11.5, opacity: 0.6 }}>{meal.detail}</div>
                    </div>
                    <b style={{ fontSize: 12.5 }}>{group(meal.kcal)}</b>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: 12 }}
                      disabled={quickAdd.isPending}
                      onClick={() => quickAdd.mutate(meal.id)}
                    >
                      Add
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, opacity: 0.55, marginTop: 8 }}>
                Save any meal, or a single item, from the log for one-tap entry.
              </div>
            </div>
          ) : null}

          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--line)' }}>
            <div className="kickn">
              <Icon name="chart" />
              Module API
            </div>
            <div style={{ marginTop: 10, fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <div style={{ opacity: 0.55, fontSize: 11 }}>Publishes</div>
                {def.publishes.map((s, i) => (
                  <span key={s}>
                    {i ? ', ' : ''}
                    <b>{s}</b>
                  </span>
                ))}
              </div>
              <div>
                <div style={{ opacity: 0.55, fontSize: 11 }}>Subscribes to</div>
                {def.subscribes.length ? (
                  def.subscribes.map((s, i) => (
                    <span key={s}>
                      {i ? ', ' : ''}
                      <b>{s}</b>{' '}
                      <span style={{ opacity: 0.55 }}>— from {publisherOf(s)?.name ?? 'elsewhere'}</span>
                    </span>
                  ))
                ) : (
                  <span style={{ opacity: 0.55 }}>nothing</span>
                )}
              </div>
              <div>
                <div style={{ opacity: 0.55, fontSize: 11 }}>Read by</div>
                {[
                  ...CROSSTALK.filter((c) => c.bars === def.primarySeries || c.line === def.primarySeries).map(
                    (c) => `${c.title} widget`,
                  ),
                  ...subscribersOf(def.primarySeries).map((m) => `${m.name} module`),
                ].join(', ') || 'nothing yet'}
              </div>
            </div>
          </div>

          {isCalories ? (
            <div style={{ padding: '16px 18px' }}>
              <div className="kickn">Sources</div>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                {(
                  [
                    ['usda', 'USDA FoodData Central first'],
                    ['off', 'Open Food Facts first'],
                  ] as const
                ).map(([source, label]) => (
                  <label className="radio" key={source}>
                    <input
                      type="radio"
                      name="src"
                      checked={sourceOrder[0] === source}
                      onChange={() =>
                        setSettings.mutate({
                          slug: 'calories',
                          settings: {
                            ...state?.settings,
                            source_order: source === 'usda' ? ['usda', 'off'] : ['off', 'usda'],
                          },
                        })
                      }
                    />
                    <span className="dot" />
                    {label}
                  </label>
                ))}
              </div>
              <div style={{ fontSize: 11, opacity: 0.55, marginTop: 8 }}>
                Barcodes always resolve through Open Food Facts.
              </div>
            </div>
          ) : null}

          {!MODULES[slug as ModuleSlug] ? <div className="error">Unknown module.</div> : null}
        </div>
      </div>
    </>
  );
}
