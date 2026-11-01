// 1h — a module drilled in from its widget.
//
// The page is the same for every module: its chart, its entries, its goals,
// and the API panel that says what it publishes and what it reads. Calories
// adds the panels only it has — saved meals and the food sources — and shows
// where every item's number came from.

import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { CrosstalkChart } from '@/components/CrosstalkChart';
import { EntryEditDialog } from '@/components/EntryEditDialog';
import { ModuleOptions, SourceOrderEditor } from '@/components/ModuleOptions';
import { MacroBar, SourceTag } from '@/components/Nutrition';
import {
  useAddGoal,
  useAddWritingProject,
  useDailyTotals,
  useEntries,
  useGoals,
  useLogSavedMeal,
  useModules,
  useProfile,
  useSavedMeals,
  useSetModuleActive,
  useSetModuleSettings,
  useUpdateWritingProject,
  useWritingProjects,
} from '@/data/hooks';
import { buildSeriesIndex } from '@/data/series';
import { addDays, rangeOfDays, timeOfDay, today as todayISO } from '@/lib/dates';
import { group, moduleValue } from '@/lib/format';
import { mean, movingMean } from '@/lib/projection';
import { readGoal } from '@/modules/goals';
import { CROSSTALK, moduleDef, publisherOf, subscribersOf } from '@/modules/registry';
import type { Entry, MealItem, ModuleSlug, ProjectWithTotals, WritingMeasure, WritingProject } from '@/lib/types';

const RANGES = [14, 30, 90] as const;

export function ModuleDetail() {
  const { slug = 'calories' } = useParams();
  const navigate = useNavigate();
  const today = todayISO();
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);
  const [editing, setEditing] = useState<Entry | null>(null);

  const def = moduleDef(slug);
  const profile = useProfile();
  const modules = useModules();
  const totals = useDailyTotals(addDays(today, -89), today);
  const entries = useEntries(today, today);
  const goals = useGoals();
  const savedMeals = useSavedMeals();
  const writingProjects = useWritingProjects();
  const addProject = useAddWritingProject();
  const updateProject = useUpdateWritingProject();
  const setActive = useSetModuleActive();
  const setSettings = useSetModuleSettings();
  const quickAdd = useLogSavedMeal();
  const addGoal = useAddGoal();

  const series = useMemo(() => buildSeriesIndex(totals.data), [totals.data]);
  const seriesFor = series.byModule;

  if (modules.isLoading || profile.isLoading) return <div className="spinner">Loading module…</div>;

  const state = (modules.data ?? []).find((m) => m.slug === slug);
  const isCalories = slug === 'calories';
  const calorieTarget = Number(state?.settings.daily_target ?? 2200);

  // The detail chart is the crosstalk pair this module takes part in, if there
  // is one; otherwise its own series against itself.
  const pair = CROSSTALK.find((c) => c.requires.includes(slug as ModuleSlug));
  const barModule = pair ? publisherOf(pair.bars) : def;
  const lineModule = pair ? publisherOf(pair.line) : def;

  // A module that records two units draws one against the other — words as
  // bars, minutes as the line — instead of plotting a series against itself.
  const otherUnitSeries = def.seriesByUnit
    ? Object.entries(def.seriesByUnit).find(([, name]) => name !== headlineSeries(def, series))?.[1]
    : undefined;

  const bars = (barModule ? seriesFor(barModule.slug) : []).slice(-range);
  const rawLine = pair
    ? (lineModule ? seriesFor(lineModule.slug) : [])
    : otherUnitSeries
      ? series.byName(otherUnitSeries)
      : [];
  const line = (lineModule?.slug === 'weight' ? movingMean(rawLine, 7) : rawLine).slice(-range);

  const moduleGoals = (goals.data ?? []).filter((g) => g.module_slug === slug);
  const goalCtx = { seriesFor, seriesByName: series.byName, today };
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
                  !pair && otherUnitSeries
                    ? otherUnitSeries
                    : lineModule && lineModule.slug !== slug
                      ? `${lineModule.primarySeries} (from ${lineModule.name})`
                      : def.primarySeries
                }
                lineDashed={pair ? pair.lineDashed : true}
                height={220}
                footnote={barMean !== null ? `Mean ${group(barMean)} ${barModule?.unit ?? ''}` : undefined}
              />
            </div>
          </div>

          <div style={{ padding: '18px 20px' }}>
            <div className="row-between">
              <h4 style={{ margin: 0 }}>{isCalories ? "Today's food" : `Today's ${def.name.toLowerCase()}`}</h4>
              <Link className="btn btn-primary" to={isCalories ? '/log' : '/'}>
                {def.kind === 'activity' ? 'Open dashboard' : def.logLabel}
              </Link>
            </div>

            {isCalories ? (
              <>
                {todayEntries.length ? (
                  <div style={{ margin: '12px 0 4px' }}>
                    <MacroBar items={todayEntries.flatMap((e) => (e.items ?? []) as MealItem[])} target={calorieTarget} />
                  </div>
                ) : null}
                <table className="table" style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Food</th>
                      <th>Portion</th>
                      <th>Source</th>
                      <th style={{ textAlign: 'right' }}>P / C / F / Fib g</th>
                      <th style={{ textAlign: 'right' }}>kcal</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {todayEntries.flatMap((entry) =>
                      ((entry.items ?? []) as MealItem[]).map((item, i) => (
                        <tr key={`${entry.id}-${i}`} className="log-row">
                          <td style={{ opacity: 0.6 }}>{i === 0 ? timeOfDay(entry.occurred_at) : ''}</td>
                          <td>
                            {item.name}
                            {item.matched_name || item.basis ? (
                              <div style={{ fontSize: 11, opacity: 0.55 }}>
                                {item.matched_name ? `“${item.matched_name}”` : ''}
                                {item.matched_name && item.basis ? ' · ' : ''}
                                {item.basis ?? ''}
                              </div>
                            ) : null}
                          </td>
                          <td>{item.portion ?? '—'}</td>
                          <td>
                            {item.kcal == null ? (
                              <span className="tag tag-outline">No match — set by hand</span>
                            ) : (
                              <SourceTag item={item} long />
                            )}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 12, opacity: 0.75, whiteSpace: 'nowrap' }}>
                            {[item.protein_g, item.carbs_g, item.fat_g, item.fiber_g]
                              .map((v) => (v == null ? '—' : group(v)))
                              .join(' / ')}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 800 }}>{group(item.kcal ?? 0)}</td>
                          <td style={{ textAlign: 'right', padding: '0 4px' }}>
                            {i === 0 ? (
                              <button type="button" className="btn btn-ghost row-edit" style={{ fontSize: 12 }} onClick={() => setEditing(entry)}>
                                Edit
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </>
            ) : (
              <table className="table" style={{ marginTop: 8 }}>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Entry</th>
                    <th style={{ textAlign: 'right' }}>Value</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {todayEntries.map((entry) => (
                    <tr key={entry.id} className="log-row">
                      <td style={{ opacity: 0.6 }}>{timeOfDay(entry.occurred_at)}</td>
                      <td>
                        {entry.label}
                        {entry.note ? <div style={{ fontSize: 11.5, opacity: 0.55 }}>{entry.note}</div> : null}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800 }}>
                        {moduleValue(entry.module_slug, entry.value, entry.unit)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '0 4px', width: 60 }}>
                        <button type="button" className="btn btn-ghost row-edit" style={{ fontSize: 12 }} onClick={() => setEditing(entry)}>
                          Edit
                        </button>
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

          {slug === 'writing' ? (
            <WritingProjectsPanel
              projects={writingProjects.data ?? []}
              measure={(state?.settings.measure as 'words' | 'min') ?? 'words'}
              onMeasure={(measure) =>
                setSettings.mutate({ slug: 'writing', settings: { ...state?.settings, measure } })
              }
              onAdd={(project) => addProject.mutate(project)}
              onUpdate={(id, patch) => updateProject.mutate({ id, patch })}
              busy={addProject.isPending || updateProject.isPending}
            />
          ) : null}

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

          {isCalories && state ? (
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--line)' }}>
              <div className="kickn">Sources</div>
              <div style={{ marginTop: 10 }}>
                <SourceOrderEditor module={state} />
              </div>
              <div style={{ fontSize: 11, opacity: 0.55, marginTop: 8 }}>
                Each source is asked only about what the ones above it could not find. Every item keeps a record of
                its source and how its number was reached; OpenAI figures are always marked as estimates.
              </div>
            </div>
          ) : null}

          {state && def.kind === 'activity' ? (
            <div style={{ padding: '16px 18px' }}>
              <div className="kickn">Tracker</div>
              <ModuleOptions module={state} />
            </div>
          ) : null}

          {!state ? <div className="error">Unknown module.</div> : null}
        </div>
      </div>
      {editing ? <EntryEditDialog entry={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

/** Which series the module's headline unit maps to, for the detail chart. */
function headlineSeries(
  def: ReturnType<typeof moduleDef>,
  series: ReturnType<typeof buildSeriesIndex>,
): string {
  const headline = series.byModule(def.slug);
  if (!def.seriesByUnit) return def.primarySeries;
  return (
    Object.values(def.seriesByUnit).find((name) => series.byName(name) === headline) ??
    def.primarySeries
  );
}

/**
 * Writing's own panel: the projects, what each has accumulated, and which unit
 * leads on the calendar. A project carries its own measure — a novel counts
 * words, morning pages count minutes — and a session may still be logged in
 * the other one.
 */
function WritingProjectsPanel({
  projects,
  measure,
  onMeasure,
  onAdd,
  onUpdate,
  busy,
}: {
  projects: ProjectWithTotals[];
  measure: WritingMeasure;
  onMeasure: (measure: WritingMeasure) => void;
  onAdd: (project: Partial<WritingProject>) => void;
  onUpdate: (id: string, patch: Partial<WritingProject>) => void;
  busy: boolean;
}) {
  const active = projects.filter((p) => p.status === 'active');
  const done = projects.filter((p) => p.status !== 'active');

  return (
    <>
      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--line)' }}>
        <div className="kickn">
          <Icon name="pencil" />
          Projects
        </div>

        <div style={{ marginTop: 8 }}>
          {active.map((project) => {
            const amount = project.measure === 'words' ? project.words : project.minutes;
            const unit = project.measure === 'words' ? 'words' : 'min';
            return (
              <div key={project.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ font: "800 13px 'Archivo'" }}>{project.title}</span>
                  {project.kind ? (
                    <span style={{ fontSize: 11, opacity: 0.55 }}>{project.kind}</span>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ marginLeft: 'auto', padding: '0 4px', fontSize: 11 }}
                    disabled={busy}
                    onClick={() => onUpdate(project.id, { status: 'finished', finished_on: todayISO() })}
                  >
                    finish
                  </button>
                </div>

                <div style={{ fontSize: 11.5, opacity: 0.6, marginTop: 2 }}>
                  {group(amount)} {unit}
                  {project.target && project.target_kind === 'total'
                    ? ` of ${group(project.target)}`
                    : project.target
                      ? ` · ${group(project.target)} ${unit} a day`
                      : ''}
                  {` · ${project.sessions} session${project.sessions === 1 ? '' : 's'}`}
                </div>

                {project.target && project.target_kind === 'total' ? (
                  <div className="bar" style={{ marginTop: 6 }}>
                    <span style={{ width: `${Math.min(amount / project.target, 1) * 100}%` }} />
                  </div>
                ) : null}
              </div>
            );
          })}

          {active.length === 0 ? (
            <div style={{ fontSize: 12.5, opacity: 0.6 }}>No projects yet.</div>
          ) : null}

          {done.length ? (
            <div style={{ fontSize: 11.5, opacity: 0.55, marginTop: 8 }}>
              {done.length} finished or shelved
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="btn btn-secondary btn-block"
          disabled={busy}
          onClick={() => {
            const title = window.prompt('Project name, e.g. "The Lantern Room"');
            if (!title) return;
            const kind = window.prompt('What kind of thing is it? (optional)') ?? undefined;
            const inMinutes = window.confirm('Measure this project in minutes? Cancel for words.');
            const target = window.prompt(
              inMinutes ? 'Daily minutes target (optional)' : 'Word-count target (optional)',
            );
            onAdd({
              title,
              kind: kind || null,
              measure: inMinutes ? 'min' : 'words',
              target: target ? Number(target) : null,
              target_kind: inMinutes ? 'daily' : 'total',
              started_on: todayISO(),
            });
          }}
        >
          + New project
        </button>
      </div>

      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--line)' }}>
        <div className="kickn">Headline measure</div>
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
          {(
            [
              ['words', 'Words lead on the calendar'],
              ['min', 'Minutes lead on the calendar'],
            ] as const
          ).map(([value, label]) => (
            <label className="radio" key={value}>
              <input
                type="radio"
                name="measure"
                checked={measure === value}
                onChange={() => onMeasure(value)}
              />
              <span className="dot" />
              {label}
            </label>
          ))}
        </div>
        <div style={{ fontSize: 11, opacity: 0.55, marginTop: 8 }}>
          Both are always recorded; this only picks which number the week strip and day lines show.
        </div>
      </div>
    </>
  );
}
