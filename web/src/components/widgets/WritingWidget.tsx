import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { LogButton } from './LogButton';
import { LogSessionDialog } from './LogSessionDialog';
import { useLogWritingSession } from '@/data/hooks';
import { totalKey } from '@/components/WeekStrip';
import { isLogged } from '@/data/series';
import { group } from '@/lib/format';
import { rangeOfDays } from '@/lib/dates';
import type { WidgetProps } from './types';

/**
 * Writing tracks projects, and a session is measured in words or in minutes.
 * The widget leads with whichever unit the user's `measure` setting picks and
 * shows the other beside it, because adding them together would be nonsense.
 */
export function WritingWidget({ compact, today, totals, goals, settings, writingProjects }: WidgetProps) {
  const log = useLogWritingSession();
  const [logging, setLogging] = useState(false);

  const measure = settings.measure ?? 'words';
  const day = totals.get(totalKey(today, 'writing'));
  const wordsToday = day?.measures?.words ?? 0;
  const minutesToday = day?.measures?.min ?? 0;

  const active = writingProjects.filter((p) => p.status === 'active');
  const lead = active[0] ?? null;
  const goal = goals.find(
    (g) => g.module_slug === 'writing' && g.cadence === 'daily' && g.series === `writing.${measure === 'min' ? 'minutes' : 'words'}`,
  );
  const target = Number(goal?.target ?? (measure === 'words' ? 750 : 30));
  const done = measure === 'words' ? wordsToday : minutesToday;
  const other = measure === 'words' ? minutesToday : wordsToday;
  const otherLabel = measure === 'words' ? 'min' : 'words';

  const days = rangeOfDays(today, 14);

  return (
    <div className={compact ? 'wg wg-compact' : 'wg'}>
      <div className="wg-head">
        <Link to="/module/writing" className="kick">
          <Icon name="pencil" />
          Writing
        </Link>
        <span className="wg-meta">
          {active.length} project{active.length === 1 ? '' : 's'}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div className="big" style={compact ? { fontSize: 36 } : undefined}>
          {group(done)}
        </div>
        <span style={{ fontSize: 11.5, opacity: 0.6 }}>
          {measure === 'words' ? `of ${group(target)} words` : `of ${group(target)} min`}
        </span>
        {other > 0 ? (
          <span style={{ fontSize: 11.5, opacity: 0.6, marginLeft: 'auto' }}>
            + {group(other)} {otherLabel}
          </span>
        ) : null}
      </div>

      {/* The project being worked on, with whatever target it carries. */}
      {lead ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ font: "800 13.5px 'Archivo'" }}>{lead.title}</span>
            {lead.kind ? <span style={{ fontSize: 11, opacity: 0.55 }}>{lead.kind}</span> : null}
          </div>
          <ProjectProgress project={lead} today={done} />
        </div>
      ) : (
        <div style={{ fontSize: 12.5, opacity: 0.6 }}>No project yet — add one from the module.</div>
      )}

      {/* Fourteen days of showing up; a day counts whichever unit it was in. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(14, 1fr)', gap: 3 }}>
        {days.map((date) => {
          const total = totals.get(totalKey(date, 'writing'));
          return (
            <span
              key={date}
              title={`${date}: ${total?.measures ? Object.entries(total.measures).map(([u, v]) => `${group(Number(v))} ${u}`).join(' · ') : 'nothing'}`}
              style={{
                aspectRatio: '1',
                background:
                  date === today && isLogged(total)
                    ? 'var(--color-accent)'
                    : isLogged(total)
                      ? 'var(--ink)'
                      : 'color-mix(in srgb, var(--ink) 10%, transparent)',
              }}
            />
          );
        })}
      </div>

      {!compact && active.length > 1 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12 }}>
          {active.slice(1, 3).map((project) => (
            <div key={project.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ opacity: 0.7 }}>{project.title}</span>
              <span style={{ opacity: 0.55 }}>
                {project.measure === 'words'
                  ? `${group(project.words)} words`
                  : `${group(project.minutes)} min`}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <LogButton label="Log session" compact={compact} onClick={() => setLogging(true)} />

      {logging ? (
        <LogSessionDialog
          projects={writingProjects}
          initialProjectId={lead?.id}
          busy={log.isPending}
          onClose={() => setLogging(false)}
          onSubmit={({ projectId, amount, measure: unit, note }) => {
            const project = writingProjects.find((p) => p.id === projectId) ?? null;
            log.mutate(
              { project, amount, measure: unit, note },
              { onSuccess: () => setLogging(false) },
            );
          }}
        />
      ) : null}
    </div>
  );
}

/** A project-sized target fills over the project; a daily one over today. */
function ProjectProgress({
  project,
  today,
}: {
  project: WidgetProps['writingProjects'][number];
  today: number;
}) {
  if (!project.target) {
    return (
      <div style={{ fontSize: 11.5, opacity: 0.6 }}>
        {project.sessions} session{project.sessions === 1 ? '' : 's'}
      </div>
    );
  }

  const done = project.target_kind === 'daily' ? today : project.measure === 'words' ? project.words : project.minutes;
  const unit = project.measure === 'words' ? 'words' : 'min';

  return (
    <>
      <div className="bar">
        <span style={{ width: `${Math.min(done / project.target, 1) * 100}%` }} />
      </div>
      <div style={{ fontSize: 11.5, opacity: 0.6 }}>
        {group(done)} of {group(project.target)} {unit}
        {project.target_kind === 'daily' ? ' today' : ''}
      </div>
    </>
  );
}
