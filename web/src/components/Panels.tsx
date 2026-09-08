import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { moduleDef } from '@/modules/registry';
import { shortDate } from '@/lib/dates';
import type { GoalReadout, UpcomingItem } from '@/modules/goals';
import type { ActiveModule } from '@/data/api';

/**
 * Goals, milestones and what is coming up. The dashboard's fourth cell at three
 * modules, one of six at five — the panel does not care which.
 */
export function GoalsPanel({
  title,
  icon,
  readouts,
  ahead,
  compact,
  span = 1,
}: {
  title: string;
  icon?: 'target' | null;
  readouts: GoalReadout[];
  ahead: UpcomingItem[];
  compact?: boolean;
  /** Columns to fill, so the widget grid never ends on a hole. */
  span?: number;
}) {
  return (
    <div
      className={compact ? 'wg wg-compact' : 'wg'}
      style={span > 1 ? { gridColumn: `span ${span}` } : undefined}
    >
      <div className="kickn">
        {icon ? <Icon name={icon} /> : null}
        {title}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 9 : 8 }}>
        {readouts.length === 0 ? <span style={{ fontSize: 12.5, opacity: 0.6 }}>No goals yet.</span> : null}

        {readouts.map(({ goal, progress, accent }) =>
          compact ? (
            <div key={goal.id} style={{ fontSize: 12.5, display: 'flex', gap: 8 }}>
              <span style={{ opacity: 0.55, width: 14, flex: 'none' }}>
                <Icon name={moduleDef(goal.module_slug).icon} />
              </span>
              <span style={accent ? { color: 'var(--color-accent-700)' } : undefined}>
                {goal.title} — <b>{progress}</b>
              </span>
            </div>
          ) : (
            <div key={goal.id}>
              <div style={{ fontSize: 12, opacity: 0.6 }}>
                {goal.kind === 'milestone' ? 'Milestone' : 'Goal'} · {moduleDef(goal.module_slug).name}
              </div>
              <div
                style={{
                  font: "800 13px 'Archivo'",
                  color: accent ? 'var(--color-accent-700)' : undefined,
                }}
              >
                {goal.title} — {progress}
              </div>
            </div>
          ),
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 'auto' }}>
        <div className="kickn" style={{ marginBottom: 7 }}>
          <Icon name="flag" />
          Coming up
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12 }}>
          {ahead.length === 0 ? <span style={{ opacity: 0.55 }}>Nothing dated ahead.</span> : null}
          {ahead.map((item) => (
            <div key={`${item.date}-${item.label}`} style={{ display: 'flex', gap: 8 }}>
              <span style={{ opacity: 0.55, width: 44, flex: 'none' }}>{shortDate(item.date)}</span>
              <span style={item.accent ? { color: 'var(--color-accent-700)' } : undefined}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <Link className="btn btn-ghost" to="/calendar" style={{ paddingLeft: 0 }}>
        See all on calendar →
      </Link>
    </div>
  );
}

/** Which modules are on, and the way in to turn one off. */
export function ModulesPanel({ modules }: { modules: ActiveModule[] }) {
  return (
    <div className="wg">
      <div className="kickn">Modules</div>
      <div className="stack">
        {modules.map((m, i) => {
          const def = moduleDef(m.slug);
          return (
            <div
              key={m.slug}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: i === modules.length - 1 ? undefined : '1px solid var(--line)',
              }}
            >
              <Link
                to={`/module/${m.slug}`}
                style={{
                  font: "800 13px 'Archivo'",
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  opacity: m.active ? 1 : 0.45,
                  color: 'inherit',
                  textDecoration: 'none',
                }}
              >
                <Icon name={def.icon} />
                {def.name}
              </Link>
              <span className={m.active ? 'tag tag-accent' : 'tag tag-neutral'}>
                {m.active ? 'Active' : 'Off'}
              </span>
            </div>
          );
        })}
      </div>
      <Link className="btn btn-ghost" to="/settings/modules" style={{ paddingLeft: 0 }}>
        Module settings →
      </Link>
    </div>
  );
}
